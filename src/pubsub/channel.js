export default class Channel {

	//- Private methods

	/**
	 * @param subscriber
	 * @return {number}
	 * @private
	 */
	_getSubscriberIndex(subscriber) {
		return this._subscribers.indexOf(subscriber);
	}

	/**
	 * @param object
	 * @private
	 */
	_broadcast(object) {
		this._subscribers.forEach(subscriber => {
			try {
				subscriber(object);
			} catch (Err) {}
		});
	}

	//- Public methods

	constructor(objectType, objectId) {
		this._subscribers = [];
		this.objectType = objectType;
		this.objectId = objectId;
	}

	/**
	 * @param {Function} callback
	 */
	addSubscriber(callback) {
		const subscriberIndex = this._getSubscriberIndex(callback);
		if (subscriberIndex === -1) {
			this._subscribers.push(callback);
		}
	}

	/**
	 * @param {Function} callback
	 */
	removeSubscriber(callback) {
		const subscriberIndex = this._getSubscriberIndex(callback);
		if (subscriberIndex !== -1) {
			delete this._subscribers[subscriberIndex];
		}
	}

	/**
	 * @return {boolean}
	 */
	hasSubscribers() {
		return this._subscribers.length === 0;
	}

	/**
	 * Broadcasts the updated `object`.
	 * @param object
	 */
	updateObject(object) {
		this._broadcast(object);
	}

	/**
	 * Broadcasts `null` to subscribers indicating that the object was deleted.
	 */
	deleteObject() {
		this._broadcast(null);
		this._subscribers = [];
	}
};