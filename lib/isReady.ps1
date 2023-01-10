# DEPRECATED:
# This script is no longer maintained, you should use the ./isReady.js script
# Leaving this script for backwards compatibility (so this container logger can work with older engines)

$CONTAINER_ID=$args[0]

if ( $CONTAINER_ID ) {
    echo "checking if container:$CONTAINER_ID exists"
    if (select-string -Pattern $CONTAINER_ID -Path ./lib/state.json) {
        echo "container $CONTAINER_ID is ready"
        Exit 0
    } else {
        echo "container $CONTAINER_ID is not ready"
        Exit 1
    }
} else {
    echo "checking if container logger is ready"
    if (select-string -Pattern "ready" -Path ./lib/state.json) {
        echo "ready"
        Exit 0
    } else {
        echo "not ready"
        Exit 1
    }
}
