How to get the server up and running


1. Update System Packages and Install Prerequisites
Update your system's package index and upgrade existing packages to ensure compatibility. Then, install essential tools: curl and git for downloading NVM, and openssl for certificate generation.

```
sudo apt update
sudo apt upgrade -y
sudo apt install curl git -y
sudo apt install openssl -y
```

2. Install NVM and Node.js
NVM (Node Version Manager) allows flexible Node.js version management without root access. Install it, reload your shell configuration, verify the installation, and set up the latest LTS version of Node.js as the default.

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm --version
nvm install --lts
nvm alias default node
node -v
```

3. Initialize the Project and Install Dependencies
Initialize a package.json file for your project and install the required Node.js packages: express for the web framework, adm-zip for ZIP handling, axios for HTTP requests, sharp for image processing, and rss-parser for parsing RSS feeds.
Bash

```
npm init -y
npm install express adm-zip axios sharp rss-parser
```

4. Generate Self-Signed SSL Certificates
Create self-signed certificates for HTTPS support. This command generates a 2048-bit RSA key and certificate valid for 365 days. You'll be prompted for details (e.g., use "localhost" for the Common Name if testing locally).

```
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
```

5. Create and Run the Startup Script
Since the server listens on privileged ports (80 and 443), it requires elevated permissions. Create a bash script to run the server using the full path to your NVM-installed Node executable (find it with which node, e.g., /home/yourusername/.nvm/versions/node/v22.x.x/bin/node). Edit the script with a text editor like vim and add the following content (replace the Node path and script name as needed):

```
#!/bin/bash
sudo /home/yourusername/.nvm/versions/node/v22.x.x/bin/node lwp-server.js
```

Make the script executable and run it. To run in the background, append & (e.g., sudo ./start_server.sh &).

```
vim start_server.sh
chmod +x start_server.sh
sudo ./start_server.sh
```
