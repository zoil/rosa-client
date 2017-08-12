import Channel from './channel';

export default class PubSub {

	//- Private methods

	/**
	 * Finds or creates `Channel` for object with `objectId` of `objectType`.
	 * @param objectType
	 * @param objectId
	 * @param createIfDoesNotExist
	 * @return {null|Channel}
	 * @private
	 */
	_getChannel(objectType, objectId, createIfDoesNotExist) {
		if (this._channels[objectType] === undefined) {
			this._channels[objectType] = [];
		}
		if (this._channels[objectType][objectId] === undefined) {
			if (createIfDoesNotExist === true) {
				this._channels[objectType][objectId] = new Channel(objectType, objectId);
			} else {
				return null;
			}
		}
		return this._channels[objectType][objectId];
	}

	/**
	 * @param {Channel} channel
	 * @return {boolean} true if the channel was deleted
	 * @private
	 */
	_cleanup(channel) {
		if (channel.hasSubscribers()) {
			delete this._channels[channel.objectType][channel.objectId];
			return true;
		} else {
			return false;
		}
	}

	//- Public methods

	constructor() {
		this._channels = {};
	}

	/**
	 * @param {String} objectType
	 * @param {String} objectId
	 * @param callback
	 */
	subscribe(objectType, objectId, callback) {
		const channel = this._getChannel(objectType, objectId, true);
		channel.addSubscriber(callback);
	};

	/**
	 * returns `true` if there are no more subscriptions left for `objectKey`
	 * @param objectType
	 * @param objectId
	 * @param callback
	 * @return {boolean}
	 */
	unsubscribe(objectType, objectId, callback) {
		const channel = this._getChannel(objectType, objectId, false);
		if (channel !== null) {
			channel.removeSubscriber(callback);
			this._cleanup(channel);
		}
	};

	/**
	 * @param callback
	 * @return {Array}
	 */
	unsubscribeAll(callback) {
		const obsoleteSubscriptions = [];
		Object.keys(this._channels).forEach(objectType => {
			Object.keys(this._channels[objectType]).forEach(objectId => {
				if (this._channels[objectType][objectId] !== undefined) {
					const channel = this._channels[objectType][objectId];
					channel.unsubscribe(callback);
					const obsolete = this._cleanup(channel);
					if (obsolete) {
						obsoleteSubscriptions.push({
							objectType,
							objectId,
						});
					}
				}
			});
		});
		return obsoleteSubscriptions;
	};

	/**
	 * @param {String} objectType
	 * @param {String} objectId
	 * @param object
	 */
	updateObject (objectType, objectId, object) {
		const channel = this._getChannel(objectType, objectId, false);
		if (channel !== null) {
			channel.updateObject(object);
		}
	};

	/**
	 * @param {String} objectType
	 * @param {String} objectId
	 */
	deleteObject(objectType, objectId) {
		const channel = this._getChannel(objectType, objectId, false);
		if (channel !== null) {
			channel.deleteObject();
			this._cleanup(channel);
		}
	};

	/**
	 * @return {Array}
	 */
	getSubscribedObjects() {
		const result = [];
		Object.keys(this._channels).forEach(objectType => {
			Object.keys(this._channels[objectType]).forEach(objectId => {
				result.push({
					objectType,
					objectId,
				});
			})
		});
	};
}