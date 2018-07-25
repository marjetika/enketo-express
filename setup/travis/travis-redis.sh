#!/bin/sh

echo "Setting up a second redis instance on port 6380..."

# remove first lines from systemd configuration file
sudo tail -n +5 ${TRAVIS_BUILD_DIR}/setup/redis/redis-enketo-cache.conf > /etc/redis/redis-enketo-cache.conf
# copy upstart service file
sudo cp ${TRAVIS_BUILD_DIR}/setup/travis/redis-enketo-cache.conf /etc/init/
sudo start redis-enketo-cache
sleep 3
