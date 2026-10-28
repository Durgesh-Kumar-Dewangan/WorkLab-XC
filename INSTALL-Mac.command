#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "WorkLab XC - installing everything this project needs ..."
if bash ./install.sh; then echo; echo "Install finished. Now double-click START-Mac.command"; else echo; echo "The install did not finish. Read the messages above."; fi
read -r -p "Press Enter to close." _
