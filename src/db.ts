export class FileStorage {
	private dbName = 'ElephantSoupDB';
	private storeName = 'audioFiles';
	private version = 1;
	private db: IDBDatabase | null = null;

	async init(): Promise<void> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.version);

			request.onupgradeneeded = (event: any) => {
				const db = event.target.result;
				if (!db.objectStoreNames.contains(this.storeName)) {
					db.createObjectStore(this.storeName);
				}
			};

			request.onsuccess = (event: any) => {
				this.db = event.target.result;
				resolve();
			};

			request.onerror = (event: any) => {
				reject('IndexedDB init error: ' + event.target.error);
			};
		});
	}

	async saveFile(id: string, file: Blob): Promise<void> {
		if (!this.db) await this.init();
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([this.storeName], 'readwrite');
			const store = transaction.objectStore(this.storeName);
			const request = store.put(file, id);

			request.onsuccess = () => resolve();
			request.onerror = (event: any) => reject('Save file error: ' + event.target.error);
		});
	}

	async getFile(id: string): Promise<Blob | null> {
		if (!this.db) await this.init();
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([this.storeName], 'readonly');
			const store = transaction.objectStore(this.storeName);
			const request = store.get(id);

			request.onsuccess = (event: any) => resolve(event.target.result || null);
			request.onerror = (event: any) => reject('Get file error: ' + event.target.error);
		});
	}

	async deleteFile(id: string): Promise<void> {
		if (!this.db) await this.init();
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([this.storeName], 'readwrite');
			const store = transaction.objectStore(this.storeName);
			const request = store.delete(id);

			request.onsuccess = () => resolve();
			request.onerror = (event: any) => reject('Delete file error: ' + event.target.error);
		});
	}
}

export const fileStorage = new FileStorage();
