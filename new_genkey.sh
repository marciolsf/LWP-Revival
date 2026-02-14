sudo mkdir -p /etc/nginx/ssl
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
sudo cp cert.pem /etc/nginx/ssl/K1_Self_IP.crt
sudo cp key.pem /etc/nginx/ssl/
sudo chmod 600 /etc/nginx/ssl/key.pem
