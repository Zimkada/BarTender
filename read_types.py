
import os

file_path = r'c:\Users\HP ELITEBOOK\DEV\BarTender\src\lib\database.types.ts'

try:
    with open(file_path, 'r', encoding='utf-16-le') as f:
        content = f.read()
        print(content)
except Exception as e:
    # Try utf-8 if utf-16 fails
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            print(content)
    except Exception as e2:
        print(f"Error reading file: {e}, {e2}")
