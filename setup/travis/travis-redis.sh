#!/bin/sh

echo "Setting up a second redis instance on port 6380..."

CONFIGPATH=${TRAVIS_BUILD_DIR}/setup/travis

#sudo cp ${CONFIGPATH}/redis-enketo-cache-upstart.conf /etc/redis/redis-enketo-cache.conf
sudo cp ${TRAVIS_BUILD_DIR}/setup/redis/redis-enketo-cache.conf /etc/redis/
sudo cp ${CONFIGPATH}/redis-enketo-cache.conf /etc/init/
sudo start redis-enketo-cache
sleep 3
