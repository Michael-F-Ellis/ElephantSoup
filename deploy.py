#!/usr/bin/env python3
"""
Deployment script for the SimpleRecorder web application (Vite/TypeScript version).

This script automates the deployment process by:
1. Running `npm run build` to generate the distribution files in `dist/`
2. Copying the contents of `dist/` to the GitHub Pages repository
3. Committing the changes in the target repository
4. Pushing to GitHub

Target repository: michael-f-ellis.github.io
Target directory: simplerecorder
"""

import shutil
import os
import subprocess
import sys

def main():
    # 1. Build the project
    print("Building project...")
    try:
        subprocess.run(["npm", "run", "build"], check=True)
    except subprocess.CalledProcessError:
        print("Build failed. Aborting deployment.")
        sys.exit(1)

    # 2. Define Source and Destination
    source_dir = "dist"
    target_repo_dir = "../michael-f-ellis.github.io"
    target_sub_dir = "simplerecorder"
    destination_full_path = os.path.join(target_repo_dir, target_sub_dir)

    print(f"Deploying from {source_dir} to {destination_full_path}...")

    if not os.path.exists(source_dir):
        print(f"Error: Source directory '{source_dir}' does not exist after build.")
        sys.exit(1)

    # Ensure destination directory exists
    if not os.path.exists(destination_full_path):
        try:
            os.makedirs(destination_full_path, exist_ok=True)
        except OSError as e:
            print(f"Error creating destination directory: {e}")
            sys.exit(1)

    # 3. Copy Files
    # Copy source_dir content to destination_full_path
    try:
        shutil.copytree(source_dir, destination_full_path, dirs_exist_ok=True)
        print("Files copied successfully.")
    except Exception as e:
        print(f"Error copying files: {e}")
        sys.exit(1)

    # 4. Git Operations
    cwd = os.getcwd()
    try:
        os.chdir(target_repo_dir)
        print(f"Changed directory to {os.getcwd()}")
        
        # Add changes in the specific subdirectory
        # git add -A ensures we catch updates/deletions/creations
        subprocess.run(["git", "add", target_sub_dir], check=True)
        
        # Commit
        # Use check=False because if there are no changes, commit returns 1
        subprocess.run(["git", "commit", "-m", "Update simplerecorder (Vite build)"], check=False)
        
        # Push
        subprocess.run(["git", "push"], check=True)
        print("Deployment push complete.")
        
    except Exception as e:
        print(f"Git operation failed: {e}")
    finally:
        os.chdir(cwd)

if __name__ == "__main__":
    main()
