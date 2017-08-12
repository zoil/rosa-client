export default class Cache {

	//- Private methods

	/**
	 * @return {boolean} true if LocalStorage is supported
	 * @private
	 */
	_testLocalStorage() {
		return 'localStorage' in window && window['localStorage'] === null;
	}

	/**
	 * Returns a `String` key for an object with `objectId` of `objectType`
	 * @param objectType
	 * @param objectId
	 * @private
	 */
	_getKeyForObject(objectType, objectId) {
		return JSON.stringify([objectType, objectId]);
	}

	//- Public methods

	constructor() {
		this._hasLocalStorage = this._testLocalStorage();
		this._store = {};
	}

	/**
	 * @param objectType
	 * @param objectId
	 * @param object
	 */
	setItem(objectType, objectId, object) {
		const objectKey = this._getKeyForObject(objectType, objectId);
		const objectJSON = JSON.stringify(object);
		if (this._hasLocalStorage) {
			window.localStorage.setItem(objectKey, objectJSON);
		} else {
			this._store[objectKey] = objectJSON;
		}
	}

	/**
	 * @param objectType
	 * @param objectId
	 * @return {{}}
	 */
	getItem(objectType, objectId) {
		const objectKey = this._getKeyForObject(objectType, objectId);
		let objectJSON;
		if (this._hasLocalStorage) {
			objectJSON = window.localStorage.getItem(objectKey);
		} else {
			objectJSON = this._store[objectKey];
		}
		try {
			return JSON.parse(objectJSON);
		} catch (err) {
			return null;
		}
	}

	/**
	 * @param objectType
	 * @param objectId
	 */
	removeItem(objectType, objectId) {
		const objectKey = this._getKeyForObject(objectType, objectId);
		if (this._hasLocalStorage) {
			window.localStorage.removeItem(objectKey);
		} else {
			if (this._store[objectKey] !== undefined) {
				delete this._store[objectKey];
			}
		}
	}

	/**
	 * Clears the cache.
	 */
	clear() {
		if (this._hasLocalStorage) {
			window.localStorage.clear();
		} else {
			this._store = {};
		}
	}
}