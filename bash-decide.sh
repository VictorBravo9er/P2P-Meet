#!/bin/bash

echo "VERCEL_ENV: $VERCEL_ENV"
echo "VERCEL_GIT_COMMIT_REF: $VERCEL_GIT_COMMIT_REF"

# 1. Branch filter
case "$VERCEL_GIT_COMMIT_REF" in
  preview|main|master)
    ;;
  *)
    echo "No need to build for branch $VERCEL_GIT_COMMIT_REF"
    echo "Skipping deployment."
    exit 0
    ;;
esac

# 2. If no previous SHA, build
if [ -z "$VERCEL_GIT_PREVIOUS_SHA" ]; then
  echo "No previous deployment. Proceeding with build."
  exit 1
fi

# 3. Diff against previous deployment
git diff $VERCEL_GIT_PREVIOUS_SHA HEAD --quiet -- ./src
diff_exit=$?

if [ $diff_exit -eq 0 ]; then
  echo "No changes in src → skipping build"
  exit 0
elif [ $diff_exit -eq 1 ]; then
  echo "Changes detected → building"
  echo "Building for branch $VERCEL_GIT_COMMIT_REF"
  echo "Deploying."
  exit 1
else
  echo "Git diff error"
  exit $diff_exit
fi
