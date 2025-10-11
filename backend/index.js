const express = require('express');//loads the express library, which is used to create web servers
const Docker = require('dockerode');//loads a node.js library for interacting with Docker
const { v4: uuidv4 } = require('uuid');//loads a library for generating unique identifiers (UUIDs)-for session management
const cors = require('cors');// loads a library for handling Cross-Origin Resource Sharing (CORS) in web applications- allows server to accept requests from different origins
const path = require('path');//loads a built-in node.js module for handling and transforming file paths-useful for static file serving or streaming data
const { PassThrough } = require('stream');//loads a built-in node.js module for working with streams of data

const app = express();//creates an instance of an express application
app.use(express.json());//middleware to parse incoming JSON request bodies
app.use(cors());//middleware to enable CORS for all routes
//parsing means converting data from one format to another, such as from JSON to a JavaScript object

// Docker connection candidates
const dockerCandidates = () => {//function that returns possible ways to connect to docker daemon
  const candidates = [];//array to hold different connection methods
  if (process.env.DOCKER_HOST) candidates.push({ type: 'env', config: {} });//if DOCKER_HOST environment variable is set, add it as a candidate
  if (process.platform === 'win32') {//if the platform is windows, add named pipes as candidates
    const pipes = ['dockerDesktopLinuxEngine', 'dockerDesktopEngine', 'docker_engine'];//common named pipes for docker on windows
    for (const pipe of pipes) candidates.push({ type: 'npipe', config: { socketPath: `//./pipe/${pipe}` } });
  }//add unix socket as a candidate for non-windows platforms on linux/macOS
  candidates.push({ type: 'unix', config: { socketPath: '/var/run/docker.sock' } });//default unix socket path for docker
  return candidates;//return the array of candidates
};
//here process.platform is a built-in node.js variable that indicates the operating system platform
//process.env is a built-in node.js object that contains environment variables
//process is a global object in node.js that provides information about the current process
//this function helps in trying different methods to connect to the docker daemon based on the environment
//docker daemon is a background service that manages docker containers on a host system
//the candidates array contains objects with type and config properties, where type indicates the connection method and config contains the necessary configuration for that method

let docker;//variable to hold the connected docker client instance- in simple terms, it will be used to interact with docker containers, images, and other resources
async function connectDocker() {//asynchronous function to connect to the docker daemon using the candidates defined earlier
  const candidates = dockerCandidates();//get the list of connection candidates-calls the dockerCandidates function to get the array of connection methods
  for (const candidate of candidates) {
    try {
      const client = candidate.type === 'env' ? new Docker() : new Docker(candidate.config);
      await client.ping();//ping the docker daemon to check if the connection is successful, await is used to wait for the ping response
      console.log(`Connected to Docker via ${candidate.type === 'env' ? process.env.DOCKER_HOST : candidate.config.socketPath}`);//log the successful connection method
      return client;//return the connected docker client instance
    } catch (e) {
      // try next
    }
  }//in the for loop, it iterates over each candidate and attempts to create a new Docker client instance using the specified configuration
  throw new Error('Unable to connect to Docker daemon');//if all candidates fail, throw an error indicating the failure to connect to the docker daemon
}
//async means the function will return a promise and can use the await keyword to wait for asynchronous operations to complete, in simple terms, it allows the function to perform tasks that take time (like network requests) without blocking the rest of the code from running
//program will continue to execute subsequent code without waiting for that asynchronous function to finish.
//JavaScript does not wait. It immediately moves to the next line of your code and executes it.
const APP_LABEL = 'rdp-provisioner';//label to identify and manage containers created by this application
const INSTANCE_LABEL_KEY = 'rdp.instanceId';//label key to store unique instance IDs for each container
const USE_TRAEFIK = process.env.USE_TRAEFIK === '1';//environment variable to determine if Traefik should be used for routing
//Traefik is a popular open-source reverse proxy and load balancer that can be used to manage and route traffic to multiple services or applications running in containers
//reverse proxy in simple terms, it acts as an intermediary for requests from clients seeking resources from servers
//load balancer in simple terms, it distributes incoming network traffic across multiple servers to ensure no single server becomes overwhelmed, improving performance and reliability

function toNanoCPUs(cpus) { return Math.max(1, Math.floor((Number(cpus) || 1) * 1e9)); }
//toNanoCPUs function converts a CPU value (in cores) to nanoseconds of CPU time, which is the unit used by Docker for CPU allocation
function toBytes(mb) { return Math.max(64, Math.floor(Number(mb) || 512)) * 1024 * 1024; }
//toBytes function converts a memory value (in megabytes) to bytes, which is the unit used by Docker for memory allocation

//Math.max is used to ensure a minimum value (1 CPU core and 64 MB of RAM) is always allocated
//Math.floor is used to round down the calculated values to the nearest whole number
//Number is used to convert the input values to numbers, with a fallback to default values (1 CPU core and 512 MB of RAM) if the input is invalid or not provided


function pullImageIfNeeded(image) {// function to pull a docker image if it is not already available locally
  return new Promise((resolve, reject) => {
  //pullImageIfNeeded function returns a promise that resolves when the image is successfully pulled or rejects if there is an error
    docker.pull(image, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (pullErr) => (pullErr ? reject(pullErr) : resolve()));
    });
  });
}

async function findContainerByInstanceId(id) {
  //function to find a docker container by its instance ID using the defined labels
  const list = await docker.listContainers({ all: true, filters: { label: [`app=${APP_LABEL}`, `${INSTANCE_LABEL_KEY}=${id}`] } });
  //listContainers method retrieves a list of containers that match the specified filters, including both running and stopped containers (all: true)
  //filters parameter is used to filter the containers based on specific criteria, in this case, the labels defined earlier

  if (!list.length) return null;//if no containers are found, return null
  return docker.getContainer(list[0].Id);// if a container is found, return the docker container instance using its ID
}

async function runExecCmd(container, cmdArray) {
  //function to run a command inside a docker container using the exec feature
  //container parameter is the docker container instance where the command will be executed
  //cmdArray parameter is an array of strings representing the command and its arguments to be executed inside the container
  //cmd is the command to be executed inside the container, provided as an array of strings

  //execInstance is the docker exec instance created using the specified command and options
  const execInstance = await container.exec({ Cmd: cmdArray, AttachStdout: true, AttachStderr: true });
  //AttachStdout and AttachStderr options are set to true to capture the command's output and error streams
  //AttachStdout means the standard output stream of the command will be captured
  //AttachStderr means the standard error stream of the command will be captured
  return new Promise((resolve, reject) => {
    //return a promise that resolves with the command output or rejects if there is an error
    
    execInstance.start((err, stream) => {
      //start method starts the execution of the command inside the container and provides a stream for capturing the output
      if (err) return reject(err);
      //if there is an error starting the command, reject the promise with the error
      //stream is the stream object that captures the output of the command execution
      
      const out = new PassThrough();
      // out stream captures the standard output of the command execution
      const errOut = new PassThrough();
      // errOut stream captures the standard error output of the command execution

      //PassThrough streams are used to capture and process the output and error streams from the command execution
      //PassThrough is a type of stream in Node.js that allows data to pass through it without any modification
      //it can be used to read data from one stream and write it to another stream, effectively acting as a conduit for data flow
      //here, PassThrough streams are used to capture the standard output and standard error streams from the command execution inside the docker container
      //the data from these streams is then collected and processed to provide the final output of the command execution  

      let stdout = '';//variable to accumulate the standard output data
      let stderr = '';//variable to accumulate the standard error data
      out.on('data', (c) => { stdout += c.toString(); });
      //event listener to accumulate data from the standard output stream
      errOut.on('data', (c) => { stderr += c.toString(); });
      //event listener to accumulate data from the standard error stream
      container.modem.demuxStream(stream, out, errOut);
      //modem.demuxStream method is used to demultiplex the combined output stream into separate standard output and standard error streams
      //demuxStream method is used to demultiplex the combined output stream into separate standard output and standard error streams
      //demultiplexing is the process of separating a single stream of data into multiple streams based on certain criteria
      //here, it separates the combined output stream from the command execution into standard output and standard error streams

      stream.on('end', async () => {
      //event listener for the end of the command execution stream
        //when the command execution stream ends, retrieve the exit code of the command and resolve the promise with the output and exit code
        try { const info = await execInstance.inspect(); resolve({ stdout, stderr, exitCode: info.ExitCode }); }
//inspect method retrieves information about the exec instance, including the exit code of the command
        catch (e) { resolve({ stdout, stderr, exitCode: null }); }
        //if there is an error inspecting the exec instance, resolve the promise with null exit code
      });
    });
  });
}
//so this function allows you to run a command inside a docker container and capture its output and exit code for further processing

app.post('/instances', async (req, res) => {
  //route to create a new docker container instance based on the request body parameters
  //req and res are the request and response objects provided by express- parameters sent in the request body to configure the new container instance
  try {
    //destructure and validate request body parameters with default values
    const { image = 'accetto/ubuntu-vnc-xfce', internalPort = 6901, cpu = 1, ramMb = 1024, name, crd } = req.body || {};
//image is the docker image to use for the container, defaulting to 'accetto/ubuntu-vnc-xfce' if not provided
//internalPort is the internal port to expose for the container, defaulting to 6901 if not provided
//cpu is the number of CPU cores to allocate for the container, defaulting to 1 if not provided
//ramMb is the amount of RAM (in megabytes) to allocate for the container, defaulting to 1024 MB if not provided
//name is an optional name for the container
//crd is an optional object containing Chrome Remote Desktop (CRD) configuration parameters
//req.body is the body of the incoming request, which is expected to be in JSON format and parsed by the express.json() middleware

    let imgName = typeof image === 'string' ? image.trim() : '' + (image || '');
    //trim whitespace from the image name if it is a string, otherwise convert it to a string
    if (!imgName || /\s/.test(imgName) || /["'<>]/.test(imgName) || /[:]{2,}/.test(imgName)) return res.status(400).json({ error: 'invalid image name', image: imgName });
    //validate the image name to ensure it is a non-empty string without spaces or invalid characters
e
    if (!image) return res.status(400).json({ error: 'image is required' });
    //if the image name is invalid, return a 400 Bad Request response with an error message

    const usingCRD = Boolean(crd?.code && crd?.email);
    //determine if Chrome Remote Desktop (CRD) configuration is provided
    if (!internalPort && !usingCRD) return res.status(400).json({ error: 'internalPort is required unless using Chrome Remote Desktop' });
//if internalPort is not provided and CRD configuration is not provided, return a 400 Bad Request response with an error message
    const instanceId = uuidv4().slice(0, 8);
    //generate a unique instance ID using UUID and take the first 8 characters
    //uuidv4() generates a random UUID (Universally Unique Identifier) using version 4 of the UUID standard
    //slice(0, 8) extracts the first 8 characters of the generated UUID to use as a shorter instance ID

    const containerName = (name || `desk-${instanceId}`).toLowerCase().replace(/[^a-z0-9-_]/g, '');
    //generate a container name based on the provided name or the instance ID, converting it to lowercase and removing invalid characters
    const exposed = usingCRD ? null : { [`${internalPort}/tcp`]: {} };
//if not using CRD, define the exposed ports for the container based on the internalPort parameter
    const env = [ `INSTANCE_ID=${instanceId}`, crd?.email ? `CRD_EMAIL=${crd.email}` : null, `CRD_HOSTNAME=${name || `desk-${instanceId}`}` ].filter(Boolean);
//define environment variables for the container, including the instance ID and CRD email if provided
    //filter(Boolean) removes any null or undefined values from the array
    const labels = { app: APP_LABEL, [INSTANCE_LABEL_KEY]: instanceId, 'rdp.name': containerName };
    //define labels for the container, including the application label, instance ID label, and container name label
    if (!usingCRD && internalPort) labels['rdp.internalPort'] = String(internalPort);
    //if not using CRD and internalPort is provided, add the internalPort label to the container labels
    if (USE_TRAEFIK && !usingCRD) {
      //if Traefik is enabled and not using CRD, add Traefik-specific labels for routing
      labels['traefik.enable'] = 'true';
      //enable Traefik for this container
      labels[`traefik.http.routers.${containerName}.entrypoints`] = 'web';
      //define the entry points for the Traefik router
      labels[`traefik.http.routers.${containerName}.rule`] = `PathPrefix(\`/i/${instanceId}\`)`;
      //define the routing rule for the Traefik router based on the instance ID
      labels[`traefik.http.services.${containerName}.loadbalancer.server.port`] = String(internalPort);
      //define the internal port for the Traefik service load balancer 
      labels[`traefik.http.middlewares.${containerName}-strip.stripprefix.prefixes`] = `/i/${instanceId}`;
      //define a middleware to strip the prefix from the request path, so the application receives the correct path
      //strip prefix means removing a specific part of the URL path before forwarding the request to the application
      labels[`traefik.http.routers.${containerName}.middlewares`] = `${containerName}-strip`;
      //associate the middleware with the Traefik router
    }
    if (crd?.email) labels['rdp.crdEmail'] = crd.email;
    //if CRD email is provided, add the crdEmail label to the container labels
    if (crd?.code) labels['rdp.crdConfigured'] = 'true';
//if CRD code is provided, add the crdConfigured label to indicate that CRD is configured for this container
    if (typeof image !== 'string' || !image.trim()) return res.status(400).json({ error: 'image is required and must be a non-empty string' });
//if the image parameter is not a valid non-empty string, return a 400 Bad Request response with an error message 
//res.status(400) sets the HTTP status code of the response to 400 (Bad Request)
//.json({ error: 'message' }) sends a JSON response with an error message
    const containerConfig = { Image: image, name: containerName, Env: env, HostConfig: { PublishAllPorts: usingCRD ? false : !USE_TRAEFIK, Memory: toBytes(ramMb), NanoCpus: toNanoCPUs(cpu), RestartPolicy: { Name: 'unless-stopped' } }, Labels: labels };
  //define the configuration for the new docker container
    //Image is the docker image to use for the container
    //name is the name of the container
    //Env is an array of environment variables to set in the container
    //HostConfig contains host-specific configuration options for the container
    //PublishAllPorts determines whether to publish all exposed ports to random host ports (true) or not (false)
    //Memory is the maximum amount of memory (in bytes) to allocate for the container, converted from megabytes using the toBytes function
    //NanoCpus is the maximum amount of CPU time (in nanoseconds) to allocate for the container, converted from CPU cores using the toNanoCPUs function
    //RestartPolicy defines the restart policy for the container, in this case, it will restart unless explicitly stopped
    //Labels is an object containing labels to apply to the container for identification and management

    if (!usingCRD && exposed) containerConfig.ExposedPorts = exposed;
// if not using CRD and exposed ports are defined, add the ExposedPorts property to the container configuration
    let container;//variable to hold the created docker container instance
    try { container = await docker.createContainer(containerConfig); }
    //attempt to create the docker container using the defined configuration
    catch (err) {
      //if there is an error creating the container, check if it is due to the image not being found locally
      const msg = err?.json?.message || err?.message || String(err);
      //json property contains the error message returned by the docker daemon
      if (err?.statusCode === 404 && /No such image/i.test(msg)) { await pullImageIfNeeded(image); container = await docker.createContainer(containerConfig); }
      //if the error indicates that the image is not found (404 status code and "No such image" message), attempt to pull the image and then create the container again
      else if (err?.statusCode === 400 && /invalid reference format/i.test(msg)) return res.status(400).json({ error: 'invalid image reference format', image, details: msg });
      //if the error indicates an invalid image reference format (400 status code and "invalid reference format" message), return a 400 Bad Request response with an error message
      else throw err;
      //if the error is of any other type, rethrow the error to be caught by the outer catch block
    }

    await container.start();//start the created docker container

// If CRD configuration is provided, attempt to set up Chrome Remote Desktop (CRD) inside the container
    // Automatic CRD registration (set PIN + start-host) with a single retry
    if (crd?.password && crd?.code && crd?.email) {
      //if CRD password, code, and email are all provided, proceed with CRD setup
      let attempts = 0;//variable to track the number of CRD registration attempts
      let registered = false;//variable to track if CRD registration was successful
      let lastResult = null;//variable to hold the result of the last CRD registration attempt
      const maxAttempts = 2;//maximum number of CRD registration attempts (initial attempt + 1 retry)
      while (attempts < maxAttempts && !registered) {
        //loop until the maximum number of attempts is reached or registration is successful
        attempts += 1;
        
        try {
          // Attempt to set the PIN and register the host with CRD
          // Note: the container must have started the CRD service for this to work
          
          const user = process.env.CRD_USER || 'crduser';
          //user is the username to use for CRD registration, defaulting to 'crduser' if not provided in the environment variable CRD_USER
          const setPwCmd = ['bash', '-lc', `echo "${user}:${crd.password}" | chpasswd`];
          //setPwCmd is the command to set the user's password inside the container using the chpasswd command
          const r1 = await runExecCmd(container, setPwCmd);
//execute the set password command inside the container and wait for the result
//await doesnt let you move to the next line until the promise is resolved
          const crdCmd = `DISPLAY= /opt/google/chrome-remote-desktop/start-host --code='${crd.code}' --redirect-url='https://remotedesktop.google.com/_/oauthredirect' --name='${name || `desk-${instanceId}`}' --pin='${crd.password}' --user='${crd.email}'`;
 //crdCmd is the command to register the host with Chrome Remote Desktop using the start-host script and the provided CRD configuration parameters       
          const runCmd = ['bash', '-lc', `su - ${user} -c "${crdCmd.replace(/"/g, '\\"')}"`];
        //runCmd is the command to execute the CRD registration command as the specified user inside the container using su
        //replace(/"/g, '\\"') is used to escape double quotes in the crdCmd string to ensure it is correctly interpreted when passed to the bash shell
        //su - ${user} -c "command" runs the specified command as the specified user, with a login shell (-)  
          const r2 = await runExecCmd(container, runCmd);
//execute the CRD registration command inside the container and wait for the result
          // Start the CRD service after registration
          const startCmd = ['bash', '-lc', `su - ${user} -c "/opt/google/chrome-remote-desktop/chrome-remote-desktop --start"`];
//startCmd is the command to start the Chrome Remote Desktop service inside the container as the specified user using su
//--start option is used to start the CRD service
          const r3 = await runExecCmd(container, startCmd);
// execute the start CRD service command inside the container and wait for the result
          lastResult = { setPw: r1, register: r2, start: r3 };
          //lastResult holds the results of the set password, register, and start commands for debugging purposes
          // Check the output and exit codes to determine if registration was successful
          // Look for common failure messages in the combined output
          // If registration failed, the loop will retry up to maxAttempts times
          // If registration is successful, the loop will exit early  
          const combined = (r1.stdout || '') + (r1.stderr || '') + (r2.stdout || '') + (r2.stderr || '');
          //combined variable holds the combined output (stdout and stderr) of the set password and register commands for analysis
          //combined output is useful for checking for error messages or success indicators
          const failed = /failed to register host|failed to register|please provide a numeric pin|please provide a numeric PIN/i.test(combined) || (r2.exitCode !== null && r2.exitCode !== 0);
          //failed variable is true if the combined output contains common failure messages or if the register command exited with a non-zero exit code
          if (!failed) registered = true;//if registration did not fail, set registered to true to indicate success
        } catch (e) {
          lastResult = { error: String(e) };
          //if there is an error during the CRD setup process, capture the error message in lastResult for debugging purposes
        }

        if (!registered && attempts < maxAttempts) {
          try { await container.remove({ force: true }); } catch (e) { console.warn('Failed to remove container during CRD retry:', e && e.message ? e.message : e); }
          container = await docker.createContainer(containerConfig);
          await container.start();
        }
        //if registration was not successful and there are remaining attempts, remove the existing container (if possible), create a new container with the same configuration, and start it again before retrying the CRD setup process
      }
      req.crdRegistration = { success: registered, attempts, lastResult };
      //store the CRD registration result in the request object for later use (e.g., in the response)
    }
    //basically, this block of code attempts to set up Chrome Remote Desktop (CRD) inside the newly created docker container by setting a user password, registering the host with CRD using the provided configuration parameters, and starting the CRD service. It includes error handling and retries in case of failures during the registration process

    // Retrieve container information after starting

    const info = await container.inspect();
    let url = null;//variable to hold the access URL for the container
    if (usingCRD) url = null;//if using CRD, the access URL is not applicable (null)
    else if (USE_TRAEFIK) url = `http://localhost/i/${instanceId}`;//if using Traefik, construct the access URL based on the instance ID
    else {
      const portInfo = info.NetworkSettings.Ports[`${internalPort}/tcp`];
      const hostPort = portInfo && portInfo[0] ? portInfo[0].HostPort : null;
      url = hostPort ? `http://localhost:${hostPort}` : null;
    }
    //if not using CRD or Traefik, retrieve the mapped host port for the internalPort and construct the access URL accordingly
    //info.NetworkSettings.Ports contains the port mapping information for the container
    //`${internalPort}/tcp` is the key used to access the port mapping for the specified internalPort and TCP protocol
    //portInfo variable holds the array of port mapping objects for the specified internalPort
    //hostPort variable extracts the HostPort from the first port mapping object, if available
    //the access URL is constructed based on whether CRD or Traefik is used, or based on the mapped host port if neither is used  then return a JSON response with the instance details

    return res.json({ id: instanceId, name: containerName, image, cpu, ramMb, internalPort, url, crdAccessUrl: usingCRD ? 'https://remotedesktop.google.com/access' : null, crdEmail: usingCRD ? crd.email : null, containerId: info.Id.substring(0, 12), state: info.State.Status, crdRegistration: req.crdRegistration || null });
    //return a JSON response with the instance details, including the instance ID, container name, image, CPU and RAM allocation, internal port, access URL, CRD access URL and email (if applicable), container ID, container state, and CRD registration result (if applicable)
  } catch (err) {
    console.error(err);
    const msg = err?.json?.message || err?.message || String(err);
    if (/invalid reference format/i.test(msg) || /bad parameter - invalid reference format/i.test(msg)) return res.status(400).json({ error: 'invalid image reference format', image: req.body?.image, details: msg });
    res.status(500).json({ error: 'failed to create instance', details: String(err) });
    //if there is an error during the instance creation process, log the error to the console and return a 500 Internal Server Error response with an error message
  }
});

app.get('/instances', async (_req, res) => {
  // route to list all docker container instances created by this application
  // _req is the request object (not used in this route, hence the underscore prefix)
  // res is the response object provided by express
  try {
    const list = await docker.listContainers({
      all: true,
      filters: { label: [`app=${APP_LABEL}`] },
      //listContainers method retrieves a list of containers that match the specified filters, including both running and stopped containers (all: true)
      //filters parameter is used to filter the containers based on specific criteria, in this case, the application label defined earlier
    });
    const instances = list.map((c) => {
      //map over the list of containers and transform each container object into a simplified instance object with relevant details
      const labels = c.Labels || {};
//labels variable holds the labels applied to the container, defaulting to an empty object if no labels are present
      const internalPortLabel = labels['rdp.internalPort'];
    //internalPortLabel variable holds the value of the internalPort label applied to the container, if present
      const ports = c.Ports || [];
      //ports variable holds the array of port mapping objects for the container, defaulting to an empty array if no ports are present
      //in simple terms, it contains information about the ports that are exposed and mapped for the container
      const mapped = internalPortLabel
//if internalPortLabel is present, find the port mapping object that matches the internalPort and TCP protocol
      ? ports.find((p) => String(p.PrivatePort) === String(internalPortLabel) && p.Type === 'tcp')
        : null;//mapped variable holds the port mapping object that matches the internalPort and TCP protocol, or null if not found or if internalPortLabel is not present
      //PrivatePort is the internal port exposed by the container
      //Type is the protocol type (e.g., 'tcp' or 'udp') of the port mapping
      //find method is used to search for the first port mapping object that matches the specified criteria
      //if a matching port mapping object is found, it is assigned to the mapped variable; otherwise, mapped is set to null
      //in simple terms, it checks if the container has a port mapping that matches the internalPort specified in its labels and retrieves that mapping if it exists
      const crdEmail = labels['rdp.crdEmail'];
      const usingCRD = Boolean(crdEmail || labels['rdp.crdConfigured']);
      let url = null;

      if (usingCRD) {
        url = null;
      } else if (USE_TRAEFIK) {
        url = `http://localhost/i/${labels[INSTANCE_LABEL_KEY]}`;
      } else {
        url = mapped ? `http://localhost:${mapped.PublicPort}` : null;
      }
      return {
        id: labels[INSTANCE_LABEL_KEY],
  name: labels['rdp.name'] || c.Names?.[0]?.replace(/^\//, ''),
        image: c.Image,
        state: c.State,
        status: c.Status,
        cpu: undefined,
        ramMb: undefined,
  internalPort: internalPortLabel ? Number(internalPortLabel) : null,
        url,
        crdAccessUrl: usingCRD ? 'https://remotedesktop.google.com/access' : null,
        crdEmail: crdEmail || null,
        containerId: c.Id.substring(0, 12),
      };
    });

    res.json(instances);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to list instances', details: String(err) });
  }
});

app.delete('/instances/:id', async (req, res) => {
  try {
    const container = await findContainerByInstanceId(req.params.id);
    if (!container) return res.status(404).json({ error: 'not found' });
    try {
      await container.stop().catch(() => {});
      await container.remove({ force: true });
      return res.json({ ok: true });
    } catch (err) {
      const msg = err?.json?.message || String(err);
      // Docker sometimes reports removal already in progress; treat this as success
      if (/removal of container .* is already in progress/i.test(msg) || /is already in progress/i.test(msg)) {
        console.warn('Removal already in progress for', req.params.id, msg);
        return res.json({ ok: true, warning: 'removal already in progress' });
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to delete instance', details: String(err) });
  }
});

app.post('/instances/:id/:action', async (req, res) => {
  try {
    const container = await findContainerByInstanceId(req.params.id);
    if (!container) return res.status(404).json({ error: 'not found' });

    const { action } = req.params;
    if (!['start', 'stop', 'restart'].includes(action)) {
      return res.status(400).json({ error: 'invalid action' });
    }

    if (action === 'start') await container.start();
    if (action === 'stop') await container.stop();
    if (action === 'restart') await container.restart();

    const info = await container.inspect();
    res.json({ ok: true, state: info.State.Status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to perform action', details: String(err) });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

async function start() {
  try {
    docker = await connectDocker();
  } catch (err) {
    console.error('Failed to connect to Docker daemon. Is Docker running?', err);
    process.exit(1);
  }

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`API on http://localhost:${PORT}`);
  });
}

start();
