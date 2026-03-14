const fs = require('fs');
const AdmZip = require('adm-zip');

function zipAndSend(fileName, res, filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`[ZIP] File not found: ${filePath}`);
        return res.sendStatus(404);
    }

    try {
        const zip = new AdmZip();
        const outZipName = fileName + ".zip";

        // Add the file to the zip root
        zip.addLocalFile(filePath, '');

        const zipBuffer = zip.toBuffer();

        console.log(`[ZIP] Compressing ${filePath} -> ${outZipName}`);

        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${outZipName}"`,
            'Content-Length': zipBuffer.length
        });

        res.send(zipBuffer);
    } catch (err) {
        console.error(`[ZIP] Error processing ${filePath}:`, err);
        res.sendStatus(500);
    }
}

function sendZippedFolder(folderName, res, folderPath) {
    try {
        if (!fs.existsSync(folderPath)) {
            return res.status(404).send('Folder not found');
        }

        const zip = new AdmZip();
        zip.addLocalFolder(folderPath, folderName);

        const zipBuffer = zip.toBuffer();

        console.log(`[ZIP] Compressing folder ${folderPath} -> ${folderName}`);

        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename=${folderName}`,
            'Content-Length': zipBuffer.length
        });

        return res.send(zipBuffer);

    } catch (err) {
        console.error(`Error zipping folder ${folderPath}:`, err);
        return res.status(500).send('Error creating zip');
    }
}

module.exports = { zipAndSend, sendZippedFolder };