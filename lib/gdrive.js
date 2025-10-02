import fs from "node:fs";
import { google } from "googleapis";
import mime from "mime";

const SCOPES = ["https://www.googleapis.com/auth/drive"];

/**
 * Get authenticated Google Drive client
 */
function getAuthClient() {
  let credentials;

  // Try to get credentials from environment variable (JSON string)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch (err) {
      throw new Error("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON: " + err.message);
    }
  }
  // Try to get credentials from file path
  else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH) {
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH;
    try {
      const keyFile = fs.readFileSync(keyPath, "utf8");
      credentials = JSON.parse(keyFile);
    } catch (err) {
      throw new Error(`Failed to read/parse service account file at ${keyPath}: ${err.message}`);
    }
  } else {
    throw new Error(
      "Google Drive authentication not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_JSON_PATH"
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  });

  return auth;
}

/**
 * Download text file by ID from Google Drive
 * @param {string} fileId - Google Drive file ID
 * @returns {Promise<string>} File contents as text
 */
export async function downloadTxtById(fileId) {
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });

  try {
    const response = await drive.files.get(
      {
        fileId: fileId,
        alt: "media",
      },
      { responseType: "text" }
    );

    return response.data;
  } catch (err) {
    if (err.code === 404) {
      throw new Error(
        `File not found (ID: ${fileId}). Make sure the file exists and the service account has access to it.`
      );
    }
    if (err.code === 403) {
      throw new Error(
        `Access denied to file (ID: ${fileId}). Share the file with service account email: ${
          (await auth.getClient()).email
        }`
      );
    }
    throw new Error(`Failed to download file ${fileId}: ${err.message}`);
  }
}

/**
 * Find and download the latest .txt file from a folder
 * @param {string} folderId - Google Drive folder ID
 * @returns {Promise<string>} File contents as text
 */
export async function downloadLatestTxtFromFolder(folderId) {
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });

  try {
    // List all .txt files in the folder, sorted by modified time (newest first)
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='text/plain' and trashed=false`,
      orderBy: "modifiedTime desc",
      pageSize: 1,
      fields: "files(id, name, modifiedTime)",
    });

    const files = response.data.files;
    if (!files || files.length === 0) {
      throw new Error(`No .txt files found in folder (ID: ${folderId})`);
    }

    const latestFile = files[0];
    console.log(`Found latest file: ${latestFile.name} (${latestFile.id})`);

    return await downloadTxtById(latestFile.id);
  } catch (err) {
    if (err.code === 404) {
      throw new Error(
        `Folder not found (ID: ${folderId}). Make sure the folder exists and the service account has access to it.`
      );
    }
    if (err.code === 403) {
      throw new Error(
        `Access denied to folder (ID: ${folderId}). Share the folder with service account email: ${
          (await auth.getClient()).email
        }`
      );
    }
    if (err.message.includes("No .txt files found")) {
      throw err;
    }
    throw new Error(`Failed to access folder ${folderId}: ${err.message}`);
  }
}

/**
 * Upload file to Google Drive folder
 * @param {Object} options
 * @param {string} options.filePath - Local file path to upload
 * @param {string} options.fileName - Name for the file in Drive
 * @param {string} options.folderId - Target folder ID in Drive
 * @param {string} [options.mimeType] - MIME type (auto-detected if not provided)
 * @returns {Promise<Object>} File metadata {id, name, webViewLink, webContentLink}
 */
export async function uploadFileToFolder({ filePath, fileName, folderId, mimeType }) {
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });

  // Auto-detect MIME type if not provided
  if (!mimeType) {
    mimeType = mime.getType(filePath) || "application/octet-stream";
  }

  const fileMetadata = {
    name: fileName,
    parents: [folderId],
  };

  const media = {
    mimeType: mimeType,
    body: fs.createReadStream(filePath),
  };

  try {
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name, webViewLink, webContentLink",
    });

    console.log(`Uploaded file: ${response.data.name} (${response.data.id})`);
    return response.data;
  } catch (err) {
    if (err.code === 404) {
      throw new Error(
        `Folder not found (ID: ${folderId}). Make sure the folder exists and the service account has access to it.`
      );
    }
    if (err.code === 403) {
      throw new Error(
        `Access denied to folder (ID: ${folderId}). Share the folder with service account email: ${
          (await auth.getClient()).email
        }`
      );
    }
    throw new Error(`Failed to upload file to folder ${folderId}: ${err.message}`);
  }
}

/**
 * Get service account email (useful for debugging access issues)
 * @returns {Promise<string>} Service account email
 */
export async function getServiceAccountEmail() {
  const auth = getAuthClient();
  const client = await auth.getClient();
  return client.email;
}
