#!/usr/bin/env bash
# Rebuild navfit-writer.jar from java/NavfitWriter.java (needs JDK 11+).
set -euo pipefail
cd "$(dirname "$0")"
CP="lib/jackcess-4.0.5.jar:lib/commons-lang3.jar:lib/commons-logging.jar:lib/json.jar"
rm -rf classes && mkdir -p classes
javac -cp "$CP" -d classes java/NavfitWriter.java
jar cfe navfit-writer.jar NavfitWriter -C classes .
echo "built navfit-writer.jar"
