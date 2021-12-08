"use strict";
const Docker = require('dockerode');
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const execFile = require('child_process').execFile;

module.exports = {
    docker,
    followProgress,
    pullImage,
    execCmd,
    execDockerCmd,
};


function execDockerCmd(params) {
    return new Promise((resolve, reject) => {
        execFile('/usr/bin/docker', params, {maxBuffer: 1024 * 1024 * 10} , function (error, stdout, stderr) {
            if (error) {               
                reject(error);
            }

            //logger.info("compileApk: " + stdout);
            //logger.info("execDockerCmd: app " + "\'" + stdout + "\'");
            resolve({
                stdout,
                stderr
            });
            return;
        });
    });
}

async function execCmd(container, cmd) {
    let exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true
    })
    let out = "";
    let st = await exec.start();
    for await (const chunk of st) {
        //console.log('>>> '+chunk);
        out += chunk;
    }
    let insp = await exec.inspect();
    insp.Output = out;
    return insp;
}
function followProgress(stream) {
    return new Promise((resolve,reject) => {
        docker.modem.followProgress(stream,onFinished,onProgress);
        function onFinished(err, output) {
            //console.log(`onFinished. err: ${err}`);
            if (err) {
                reject(err);
            } else {
                resolve(output);
            }
          }
          function onProgress(event) {
            //console.log(`onProgress event: ${JSON.stringify(event,null,2)}`);
            if (event.stream) {
                //"Step 1/4 :"
                if (event.stream.startsWith("Step")) {
                    console.log(`${event.stream}`);
                }
            }
          }
       
     });
}
async function pullImage(fullName) {
    //let fullName = registryURL + imageName;
    let stream = await docker.pull(fullName);
    let output = await followProgress(stream);
    //console.log(`Pull result: ${output}`);
    
    return;
}