#!/bin/bash
# openssl genrsa -out key.pem 1024
# openssl req -new -x509 -key key.pem -out cert.pem -days 3650 -sha1

sudo mkdir -p /etc/nginx/ssl
sudo cp cert.pem /etc/nginx/ssl/K1_Self_IP.crt
sudo cp key.pem /etc/nginx/ssl/
sudo chmod 600 /etc/nginx/ssl/key.pem
