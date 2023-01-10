#!/bin/sh
# DEPRECATED:
# This script is no longer maintained, you should use the ./isReady.js script
# Leaving this script for backwards compatibility (so this container logger can work with older engines)

CONTAINER_ID=$1

if [ -n "$CONTAINER_ID" ]; then
   echo "checking if container: $CONTAINER_ID exists"
   grep -q $CONTAINER_ID ./lib/state.json
else
   echo "checking if container logger is ready"
   grep -q "ready" ./lib/state.json
fi


