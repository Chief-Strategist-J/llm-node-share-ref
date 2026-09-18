#!/usr/bin/env bash

set -euo pipefail

get_script_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
}

get_package_dir() {
  local script_dir
  script_dir=$(get_script_dir)
  cd "$script_dir/../.." && pwd
}

extract_flag_token() {
  local token=""
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --token=*)
        token="${1#*=}"
        shift
        ;;
      --token|-t)
        token="$2"
        shift 2
        ;;
      *)
        shift
        ;;
    esac
  done
  echo "$token"
}

acquire_token() {
  local flag_token
  flag_token=$(extract_flag_token "$@")
  if [ -n "$flag_token" ]; then
    echo "$flag_token"
  elif [ -n "${NPM_TOKEN:-}" ]; then
    echo "$NPM_TOKEN"
  elif [ -n "${NODE_AUTH_TOKEN:-}" ]; then
    echo "$NODE_AUTH_TOKEN"
  else
    echo "Error: NPM token required. Provide via --token, NPM_TOKEN, or NODE_AUTH_TOKEN." >&2
    exit 1
  fi
}

run_prepublish() {
  echo "Running typecheck and building distribution artifacts..."
  npm run prepublishOnly
}

get_package_name() {
  node -p "require('./package.json').name"
}

get_package_version() {
  node -p "require('./package.json').version"
}

execute_publish() {
  local token="$1"
  local pkg_name="$2"
  local pkg_version="$3"
  
  echo "Checking version on official npm registry..."
  local existing_version
  existing_version=$(npm view "$pkg_name" version --registry=https://registry.npmjs.org/ --//registry.npmjs.org/:_authToken="$token" 2>/dev/null || echo "")
  
  if [ -n "$existing_version" ] && [ "$existing_version" = "$pkg_version" ]; then
    echo "Version ${pkg_version} is already published on npm registry. Auto-bumping patch version..."
    npm version patch --no-git-tag-version
    pkg_version=$(get_package_version)
  fi

  echo "Publishing ${pkg_name}@${pkg_version} to https://registry.npmjs.org/ with public access..."
  npm publish \
    --registry=https://registry.npmjs.org/ \
    --access public \
    --//registry.npmjs.org/:_authToken="$token"

  echo "Package ${pkg_name}@${pkg_version} published successfully to npmjs.org!"
}

main() {
  local package_dir
  local token
  local pkg_name
  local pkg_version
  package_dir=$(get_package_dir)
  cd "$package_dir"
  token=$(acquire_token "$@")
  export NODE_AUTH_TOKEN="$token"
  pkg_name=$(get_package_name)
  pkg_version=$(get_package_version)
  execute_publish "$token" "$pkg_name" "$pkg_version"
}

main "$@"
