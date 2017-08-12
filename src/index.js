import * as messageTypes from 'rosa/dist/message-types';

import Cache from './cache';
import Socket from './socket';
import Pubsub from './pubsub';

import {events as socketEvents} from './socket';
export {EVENT_CONNECTING, EVENT_CONNECTED, EVENT_CONNECTION_ERROR, EVENT_DISCONNECTED, EVENT_RECONNECTING} from './socket';

class RosaClient {

	//- Private methods

	_eventReceiver(event, payload) {
		if (socketEvents.indexOf(event) !== -1) {
			// this is a socket event
			if (this._eventCallbacks[event] !== undefined) {
				this._eventCallbacks[event].forEach(callback => {
					try {
						callback(payload);
					} catch (err) {}
				});
			}
		} else {
			// this is a server message
			switch (event) {
				case messageTypes.EVENT_DELETE:
					this._pubsub.deleteObject(payload.objectType, payload.objectId);
					break;
				case messageTypes.EVENT_UPDATE:
					this._pubsub.updateObject(payload.objectType, payload.objectId, payload.object);
					break;
			}
		}
	}

	//- Public methods

	constructor(options) {
		this._cache = new Cache();
		this._pubsub = new Pubsub();
		this._socket = new Socket({
			socketOptions: options.socket,
			authTokenGenerator: options.authTokenGenerator,
			getSubscriptions: this._pubsub.getSubscribedObjects.bind(this._pubsub),
			eventReceiver: this._eventReceiver.bind(this),
		});
		this._eventCallbacks = {};
	}

	/**
	 * @param event
	 * @param callback
	 */
	on(event, callback) {
		if (socketEvents.indexOf(event) !== -1) {
			if (this._eventCallbacks[event] === undefined) {
				this._eventCallbacks[event] = [];
			}
			this._eventCallbacks[event].push(callback);
		}
	}

	/**
	 * @param event
	 * @param callback
	 */
	off(event, callback) {
		if (socketEvents.indexOf(event) !== -1) {
			if (this._eventCallbacks[event] !== undefined) {
				const index = this._eventCallbacks[event].indexOf(callback);
				if (index !== -1) {
					delete this._eventCallbacks[event][index];
				}
			}
		}
	}

	/**
	 * @param {String} objectType
	 * @param {String} objectId
	 * @param {Function} callback
	 */
	subscribeObject(objectType, objectId, callback) {
		this._pubsub.subscribe(objectType, objectId, callback);
		this._socket.subscribe(objectType, objectId);

		// try to see if we have this model already cached
		const cachedObject = this._cache.getObject(objectType, objectId);
		if (cachedObject !== null) {
			callback(cachedObject);
		}
	}

	/**
	 * @param {String} objectType
	 * @param {String} objectId
	 * @param {Function} callback
	 */
	unsubscribeObject(objectType, objectId, callback) {
		const obsolete = this._pubsub.unsubscribe(objectType, objectId, callback);
		if (obsolete) {
			this._socket.unsubscribeObject(objectType, objectId);
			this._cache.remove(objectType, objectId);
		}
	}

	/**
	 * @param objectType
	 * @param objectId
	 * @param object
	 * @return {Promise}
	 */
	updateObject(objectType, objectId, object) {
		this._pubsub.updateObject(objectType, objectId, object);
		this._cache.setItem(objectType, objectId, object);
		return this._socket.updateObject(objectType, objectId, object)
			.then(payload => {
				// update again in pubsub and cache, if different
			});
	}

	/**
	 * @param objectType
	 * @param objectId
	 * @return {Promise}
	 */
	deleteObject(objectType, objectId) {
		this._pubsub.deleteObject(objectType, objectId);
		this._cache.removeItem(objectType, objectId);
		return this._socket.deleteObject(objectType, objectId);
	}

	/**
	 * @param {Function} callback
	 */
	unsubscribeAll(callback) {
		const obsoleteSubscriptions = this._pubsub.unsubscribeAll(callback);
		obsoleteSubscriptions.forEach(({objectType, objectId}) => {
			this._socket.unsubscribe(objectType, objectId);
			this._cache.remove(objectType, objectId);
		});
	}

	/**
	 * @param {String} objectType
	 * @param {String} objectId
	 * @return {Promise}
	 */
	getEntity(objectType, objectId) {
		// check whether we have the object in the cache already
		const cachedObject = this._cache.getObject(objectType, objectId);
		if (cachedObject !== null) {
			// yes we do
			return new Promise(resolve => {
				resolve(cachedObject);
			});
		} else {
			// not in the cache yet, let's try and fetch it from the socket
			return this._socket.getObject(objectType, objectId);
		}
	}
}

/**
 * @param options
 * @return {RosaClient}
 */
export default function (options) {
	return new RosaClient(options);
}