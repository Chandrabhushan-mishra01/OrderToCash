#!/bin/bash

OUTPUT_ZIP="project_archive.zip"

echo "Creating zip archive: $OUTPUT_ZIP"
echo "Excluding node_modules and py_cache directories using Python..."

# Use Python's built-in zipfile module to create the zip archive natively
python -c "
import os, zipfile

output_file = '$OUTPUT_ZIP'
exclude_dirs = {'node_modules', '__pycache__', 'py_cache', '.git'}

with zipfile.ZipFile(output_file, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('.'):
        # Modify dirs in-place to skip excluded directories at any depth
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            if file != output_file and not file.endswith('.sh'):
                file_path = os.path.join(root, file)
                zf.write(file_path)
"

echo "Done! Archive saved to $OUTPUT_ZIP"
