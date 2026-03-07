import { RepertoireData } from './types';

export class SyncManager {
	private fileHandle: FileSystemFileHandle | null = null;
	private readonly DB_NAME = 'ElephantSoupSync';
	private readonly STORE_NAME = 'handles';
	private readonly KEY = 'syncFile';

	async init() {
		this.fileHandle = await this.loadHandle();
		if (this.fileHandle) {
			// Check if we still have permission
			const permission = await (this.fileHandle as any).queryPermission({ mode: 'readwrite' });
			if (permission !== 'granted') {
				// We can't automatically prompt for permission on init (requires user gesture)
				// So we'll leave it as needing a re-link or a manual click later
				console.log("Sync file permission not granted. User must click 'Link' to re-authorize.");
			}
		}
	}

	async linkFile(): Promise<boolean> {
		try {
			const [handle] = await (window as any).showOpenFilePicker({
				types: [{
					description: 'Elephant Soup Data',
					accept: { 'application/json': ['.json'] },
				}],
				multiple: false
			});

			// Request persistent permission
			const permission = await handle.requestPermission({ mode: 'readwrite' });
			if (permission === 'granted') {
				this.fileHandle = handle;
				await this.saveHandle(handle);
				return true;
			}
		} catch (err) {
			console.error("Failed to link sync file", err);
		}
		return false;
	}

	async unlinkFile() {
		this.fileHandle = null;
		await this.deleteHandle();
	}

	hasLinkedFile(): boolean {
		return !!this.fileHandle;
	}

	async autoSave(data: RepertoireData) {
		if (!this.fileHandle) return;

		try {
			const permission = await (this.fileHandle as any).queryPermission({ mode: 'readwrite' });
			if (permission !== 'granted') return; // Silent fail if not authorized yet

			const writable = await (this.fileHandle as any).createWritable();
			await writable.write(JSON.stringify(data, null, 2));
			await writable.close();
			console.log("Auto-save to sync file complete.");
		} catch (err) {
			console.error("Auto-save failed", err);
		}
	}

	async readSyncFile(): Promise<string | null> {
		if (!this.fileHandle) return null;
		try {
			const file = await this.fileHandle.getFile();
			return await file.text();
		} catch (err) {
			console.error("Failed to read sync file", err);
			return null;
		}
	}

	// --- IndexedDB for FileHandle Persistence ---

	private async saveHandle(handle: FileSystemFileHandle) {
		const db = await this.openDB();
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction(this.STORE_NAME, 'readwrite');
			tx.objectStore(this.STORE_NAME).put(handle, this.KEY);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	private async loadHandle(): Promise<FileSystemFileHandle | null> {
		const db = await this.openDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(this.STORE_NAME, 'readonly');
			const request = tx.objectStore(this.STORE_NAME).get(this.KEY);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
	}

	private async deleteHandle() {
		const db = await this.openDB();
		const tx = db.transaction(this.STORE_NAME, 'readwrite');
		tx.objectStore(this.STORE_NAME).delete(this.KEY);
	}

	private openDB(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.DB_NAME, 1);
			request.onupgradeneeded = () => {
				request.result.createObjectStore(this.STORE_NAME);
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}
}

export const syncManager = new SyncManager();
