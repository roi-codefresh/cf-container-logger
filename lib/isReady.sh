#!/bin/bash
#

CONTAINER_ID=$1

if [[ -n "$CONTAINER_ID" ]]; then
   grep -q $CONTAINER_ID ./lib/state.json
else
   grep -q "ready" ./lib/state.json
fi


