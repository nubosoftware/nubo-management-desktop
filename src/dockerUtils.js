"use strict";
const Docker = require('dockerode');
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const execFile = require('child_process').execFile;
const axios = require('axios');
const fs = require('fs').promises;
const https = require('https');
const _ = require('underscore');
module.exports = {
    docker,
    followProgress,
    pullImage,
    execCmd,
    execDockerCmd,
    deleteImageFromRegistry,
};


function execDockerCmd(args,options) {
    return new Promise((resolve, reject) => {
        let opts = {maxBuffer: 1024 * 1024 * 10};
        if (options) {
            _.extend(opts, options)
        }
        execFile('/usr/bin/docker', args,  opts, function (error, stdout, stderr) {
            if (error) {               
                reject(error);
            }

            //logger.info("execDockerCmd: " + stdout);            
            resolve({
                stdout,
                stderr
            });
            return;
        });
    });
}

async function deleteImageFromRegistry(imageName,registryURL,registryUser,registryPassword) {
    let arr = imageName.split(":");
    let repo = arr[0];
    let tag = arr[1];
    if (!tag) {
        tag = "latest";
    }
    const auth =  Buffer.from(`${registryUser}:${registryPassword}`).toString("base64");
    const caStr = await fs.readFile(`/etc/docker/certs.d/${registryURL}/ca.crt`,"utf8");
    const httpsAgent = new https.Agent({ ca: caStr });
    
    let digest;
    try {
        let response = await axios({
            method: "get",
            url: `https://${registryURL}/v2/nubo/${repo}/manifests/${tag}`,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/vnd.docker.distribution.manifest.v2+json'
            },
            httpsAgent        
        });
        //console.log(`deleteImageFromRegistry. Headers: ${JSON.stringify(response.headers,null,2)} `);
        
        digest = response.headers['docker-content-digest'];
    } catch (err) {
        console.log(`Error image not found in registry: ${err}`);
    }
    if (digest) {
        try {
            let conf = {
                method: "delete",
                url: `https://${registryURL}/v2/nubo/${repo}/manifests/${digest}`,
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/vnd.docker.distribution.manifest.v2+json'
                },
                httpsAgent,
                data: null,     
            };
            //console.log(`request: ${JSON.stringify(conf,null,2)}`);
            let delres = await axios(conf);
            console.log(`Deleted image from registry. Status ${delres.status}`);
        } catch (err) {
            console.log(`Error failed to delete image from registry: ${err}`);
        }
    }

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
    // let stream = await docker.pull(fullName);
    // let output = await followProgress(stream);
    //console.log(`Pull result: ${output}`);   
    await execDockerCmd(['pull',fullName]);
    
    
    return;
}