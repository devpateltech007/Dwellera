@echo off
call ..\venv\Scripts\activate.bat
echo Running tests...
python psycopg2_mig.py
echo Reading output...
type out.txt
echo Finish!
