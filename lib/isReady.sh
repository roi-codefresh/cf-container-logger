#!/bin/sh
#

CONTAINER_ID=$1

echo "checking if container:$CONTAINER_ID exists"
if [ -n "$CONTAINER_ID" ]; then
   grep -q $CONTAINER_ID ./lib/state.json
else
   grep -q "ready" ./lib/state.json
fi


