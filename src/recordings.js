"use strict";

const fsp = require('fs').promises;

const { docker,
    execDockerCmd,
    ExecCmdError,
    } = require('./dockerUtils');

async function prepareVideoFile(filePath) {
    const { Common } = require('./mainModule').get();
    const logger = Common.logger;

    try {

        // run guacenc - create a raw m4v file
        let baseImage = `nubosoftware/gateway:3.2`;
        const { stdout, stderr } = await execDockerCmd(['run', '--rm', '-v', `${Common.recording_path}:${Common.recording_path}`,
                baseImage, '/usr/local/guacamole/bin/guacenc', '-s', '1280x960',filePath]);
        //console.log(`prepareVideoFile. stdout: ${stdout}, stderr: ${stderr}`);

        // run ffmpeg to create a better mp4 file
        let ffmpegImage = "jrottenberg/ffmpeg";
        let baseFileName = Common.path.basename(filePath);
        let m4vFile = `${baseFileName}.m4v`;
        let mp4File = `${baseFileName}.mp4`;
        const ffmpegRes = await execDockerCmd(['run', '--rm', '-v', `${Common.recording_path}:${Common.recording_path}`,
                '-w' , Common.recording_path, ffmpegImage , "-i" , m4vFile, "-y", mp4File]);
        //console.log(`prepareVideoFile. ffmpeg stdout: ${ffmpegRes.stdout}, stderr: ${ffmpegRes.stderr}`);

        await fsp.unlink(Common.path.join(Common.recording_path,m4vFile));

        return true;
    } catch (err) {
        if (err instanceof ExecCmdError) {
            logger.info(`prepareVideoFile. docker command error. stdout: ${err.stdout}\n stderr: ${err.stderr}`);
        }
        throw err;
    }
}

module.exports = {
    prepareVideoFile
}