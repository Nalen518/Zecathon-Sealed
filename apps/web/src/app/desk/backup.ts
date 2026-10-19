import { backupJson, BACKUP_FILENAME, type WrappedDesk } from "../../lib/keystore";

/**
 * Saves the passphrase-wrapped desk record as the backup file (FR-7). The file holds the private key and the
 * desk token only in encrypted form. It is written to the desk's own disk and never sent anywhere.
 */
export function downloadBackup(record: WrappedDesk): void {
  const url = URL.createObjectURL(new Blob([backupJson(record)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = BACKUP_FILENAME;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
