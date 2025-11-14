# How to run
```bash
cd mongodb

openssl rand -base64 756 > mongo-keyfile
chmod 400 mongo-keyfile

docker compose up -d
```