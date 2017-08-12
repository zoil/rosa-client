import SocketIOClient from 'socket.io-client';
import * as messageTypes from 'rosa/dist/message-types';

export const EVENT_CONNECTING = "connecting";
export const EVENT_RECONNECTING = "reconnecting";
export const EVENT_CONNECTED = "connected";
export const EVENT_DISCONNECTED = "disconnected";
export const EVENT_CONNECTION_ERROR = "connection_error";
export const events = [
	EVENT_CONNECTING,
	EVENT_RECONNECTING,
	EVENT_CONNECTED,
	EVENT_DISCONNECTED,
	EVENT_CONNECTION_ERROR,
];

export default class Socket {

	//- Private methods

	_updateAuthToken() {
		const token = this._tokenGenerator();
		if (typeof token === "string") {
			const encodedToken = encodeURIComponent(token);
			this._socket.io.opts.query = `token=${encodedToken}`;
		} else {
			delete this._socket.io.opts.query;
		}
	}

	/**
	 * @param {String} eventName
	 * @param payload
	 * @private
	 */
	_emit(eventName, payload = false) {
		if (this._socket !== null) {
			this._socket.emit(eventName, payload)
		} else {
			this._operationQueue.push({eventName, payload});
		}
	}

	/**
	 * Requests a tracked operation from the server.
	 * @param eventName
	 * @param payload
	 * @param timeout
	 * @return {Promise}
	 * @private
	 */
	_emitTracked(eventName, payload = false, timeout = 1000) {
		// `serial` will identify the response coming back from the server
		const serial = new Date().getTime().toString();
		return new Promise(function(resolve, reject) {
			this._emit(messageTypes.EVENT_TRACKED, {
				serial,
				eventName,
				payload,
			});

			// we will use these methods when we receive the response
			this._trackedPromises[serial] = {
				resolve,
				reject,
			};

			// start a timer to detect timeout
			this._trackedTimers[serial] = setTimeout(()=>{
				delete this._trackedTimers[serial];
				delete this._trackedPromises[serial];
				reject();
			}, timeout);
		});
	}

	/**
	 * Receive a result of a tracked message from the server.
	 * @param serial
	 * @param successful
	 * @param payload
	 * @private
	 */
	_receiveTrackedResult({serial, successful, payload}) {
		if (this._trackedTimers[serial] !== undefined) {
			clearTimeout(this._trackedTimers[serial]);
			delete this._trackedTimers[serial];

			const {resolve, reject} = this._trackedPromises[serial];
			delete this._trackedPromises[serial];
			if (successful === true) {
				resolve(payload);
			} else {
				reject(payload);
			}
		}
	}

	/**
	 * This will be called after we successfully connected to the server, that includes authentication.
	 * Any queued operations will be processed.
	 * @private
	 */
	_onConnect() {
		// restore subscriptions
		this._getSubscriptions.forEach(subscription => {
			const {objectType, objectId} = subscription;
			this.subscribeObject(objectType, objectId);
		});

		// process queued operations
		let operation;
		while (operation = this._operationQueue.unshift()) {
			const {eventName, payload} = operation;
			this._emit(eventName, payload);
		}
	}

	//- Public methods

	constructor(options) {
		this._socket = null;
		this._operationQueue = [];

		this._trackedTimers = {};
		this._trackedPromises = {};

		this._tokenGenerator = options.authTokenGenerator || (() => (false));
		this._eventReceiver = options.eventReceiver;
		this._getSubscriptions = options.getSubscriptions;
	}

	/**
	 * Attempts to connect the socket.
	 */
	connect() {
		if (this._socket !== null) {
			// we're connected already
			return;
		}

		// tell the world
		this._eventReceiver(EVENT_CONNECTING);

		// and create the socket
		this._socket = SocketIOClient('http://localhost:8081', {
			// path: '/api/chat'
			autoConnect: false,
		});

		// relay socket.io events
		const proxiedEvents = {
			error: EVENT_CONNECTION_ERROR,
			reconnect_error: EVENT_CONNECTION_ERROR,
			reconnect_failed: EVENT_CONNECTION_ERROR,
			reconnecting: EVENT_RECONNECTING,
		};
		Object.keys(proxiedEvents).forEach(socketEvent => {
			const proxiedEvent = proxiedEvents[socketEvent];
			this._socket.on(socketEvent, (payload = false) => {
				this._eventReceiver(proxiedEvent, payload);
			});
		});
		this._socket.on('connect', () => {
			this._eventReceiver(EVENT_CONNECTED);
			this._onConnect();
		});
		this._socket.on('reconnect', () => {
			this._eventReceiver(EVENT_CONNECTED);
			this._onConnect();
		});
		this._socket.on('disconnect', () => {
			this._socket = null;
			this._eventReceiver(EVENT_DISCONNECTED);
		});
		_socket.on('reconnect_attempt', () => {
			this._updateAuthToken();
			this._eventReceiver(EVENT_RECONNECTING);
		});

		// wire up externally emitted messages
		const emittedEvents = [messageTypes.EVENT_UPDATE, messageTypes.EVENT_DELETE];
		emittedEvents.forEach(eventType => {
			this._socket.on(eventType, payload => {
				this._eventReceiver(eventType, payload);
			});
		});

		// receive tracked results
		_socket.on(messageTypes.EVENT_TRACKED, this._receiveTrackedResult);

		// initialise auth token for the first time
		this._updateAuthToken();

		// finally we attempt to open the socket
		_socket.open();
	};

	/**
	 * Disconnect the socket.
	 */
	disconnect() {
		if (_socket !== null) {
			_socket.close();
		}
		this._socket = null;
		this._eventReceiver(EVENT_DISCONNECTED);
	};

	/**
	 * Subscribe to any server side changes on an object with `objectId` of `objectType`
	 * @param objectType
	 * @param objectId
	 */
	subscribeObject(objectType, objectId) {
		this._emit(messageTypes.EVENT_SUBSCRIBE, {
			objectType,
			objectId,
		});
	};

	/**
	 * Subscribe to any server side changes on an object with `objectId` of `objectType`
	 * @param objectType
	 * @param objectId
	 */
	unsubscribeObject(objectType, objectId) {
		this._emit(messageTypes.EVENT_UNSUBSCRIBE, {
			objectType,
			objectId,
		});
	};

	/**
	 * Creates `object` of `objectType` on the server.
	 * The `objectId` will be generated on the server side.
	 * @param objectType
	 * @param object
	 * @param options
	 * @return {Promise}
	 */
	createObject(objectType, object, options = false) {
		return this._emitTracked(messageTypes.EVENT_CREATE, {
			objectType,
			object,
			options,
		});
	};

	/**
	 * Deletes and object with `objectId` of `objectType` from the server.
	 * @param objectType
	 * @param objectId
	 * @param options
	 * @return {Promise}
	 */
	deleteObject(objectType, objectId, options = false) {
		return this._emitTracked(messageTypes.EVENT_DELETE, {
			objectType,
			objectId,
			options,
		});
	};

	/**
	 * Updates and object with `objectId` of `objectType` from the server.
	 * @param objectType
	 * @param objectId
	 * @param object
	 * @param options
	 * @return {Promise}
	 */
	updateObject(objectType, objectId, object, options = false) {
		return this._emitTracked(messageTypes.EVENT_UPDATE, {
			objectType,
			objectId,
			object,
			options,
		});
	};

	/**
	 * Retrieves an object with `objectId` of `objectType` from the server.
	 * @param objectType
	 * @param objectId
	 * @param options
	 * @return {Promise}
	 */
	getObject(objectType, objectId, options = false) {
		return this._emitTracked(messageTypes.EVENT_GET, {
			objectType,
			objectId,
			options,
		});
	};
}