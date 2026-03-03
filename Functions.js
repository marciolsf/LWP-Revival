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

module.exports = { zipAndSend };