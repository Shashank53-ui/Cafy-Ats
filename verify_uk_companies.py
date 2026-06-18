import pandas as pd
import requests
import re
import time
import concurrent.futures
import os

# The exact keywords requested by the user
UK_KEYWORDS = [
    "United Kingdom", "UK", "England", "Scotland", "Wales",
    "Northern Ireland", "London", "Manchester", "Birmingham",
    "Edinburgh", "Bristol", "Leeds", "Glasgow"
]

# Compile the regex pattern with word boundaries and case-insensitivity
pattern_str = r'\b(?:' + '|'.join(map(re.escape, UK_KEYWORDS)) + r')\b'
UK_REGEX = re.compile(pattern_str, re.IGNORECASE)

def check_url(row):
    provider = str(row.get('ATS Provider', '')).strip().lower()
    token = str(row.get('ATS Board Token', '')).strip()
    fallback_url = row.get('URL')
    
    # Missing or empty token
    if not token or token.lower() == 'nan':
        return row, "Dead URL"
        
    # Per-thread delay: effectively 10 concurrent requests every 0.5s (20 req/s)
    time.sleep(0.5)
        
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    
    api_map = {
        'greenhouse': f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true",
        'lever': f"https://api.lever.co/v0/postings/{token}?mode=json",
        'ashby': f"https://api.ashbyhq.com/posting-api/job-board/{token}",
        'workable': f"https://apply.workable.com/api/v3/accounts/{token}/jobs",
        'smartrecruiters': f"https://api.smartrecruiters.com/v1/companies/{token}/postings",
        'recruitee': f"https://{token}.recruitee.com/api/offers",
        'personio': f"https://{token}.jobs.personio.com/api/v1/jobs",
        'bamboohr': f"https://{token}.bamboohr.com/careers/list"
    }
    
    try:
        if provider in api_map:
            api_url = api_map[provider]
            response = requests.get(api_url, headers=headers, timeout=10)
            
            # Any non-200 -> Dead URL
            if response.status_code != 200:
                return row, "Dead URL"
                
            data = response.json()
            
            # Extract jobs array based on provider
            jobs = []
            if provider == 'greenhouse':
                jobs = data.get('jobs', [])
            elif provider == 'lever':
                jobs = data if isinstance(data, list) else []
            elif provider == 'ashby':
                jobs = data.get('jobPostings', [])
            elif provider == 'workable':
                jobs = data.get('results', [])
            elif provider == 'smartrecruiters':
                jobs = data.get('content', [])
            elif provider == 'recruitee':
                jobs = data.get('offers', [])
            elif provider == 'personio':
                jobs = data.get('data', []) if isinstance(data.get('data'), list) else data
            elif provider == 'bamboohr':
                jobs = data.get('result', []) if isinstance(data, dict) else data
                
            # If empty job list -> company isn't hiring right now, so mark as "No UK Jobs"
            if not jobs or len(jobs) == 0:
                return row, "No UK Jobs"
                
            # Check location fields in jobs
            for job in jobs:
                loc_str = ""
                if provider == 'greenhouse':
                    loc_str = str(job.get('location', {}).get('name', ''))
                elif provider == 'lever':
                    loc_str = str(job.get('categories', {}).get('location', ''))
                elif provider == 'ashby':
                    loc_str = str(job.get('locationName', ''))
                elif provider == 'workable':
                    loc = job.get('location', {})
                    loc_str = f"{loc.get('city', '')} {loc.get('country', '')}"
                elif provider == 'smartrecruiters':
                    loc = job.get('location', {})
                    loc_str = f"{loc.get('city', '')} {loc.get('country', '')}"
                elif provider == 'recruitee':
                    loc_str = str(job.get('location', ''))
                elif provider == 'personio':
                    loc_str = str(job.get('office', job.get('attributes', {}).get('office', '')))
                elif provider == 'bamboohr':
                    loc_str = str(job.get('location', ''))
                    
                if loc_str and UK_REGEX.search(loc_str):
                    return row, "UK"
                    
            # If we went through all jobs and no UK location
            return row, "No UK Jobs"
            
        else:
            # Fallback to HTML for all other ATS providers
            if not isinstance(fallback_url, str) or not fallback_url.strip() or fallback_url.strip().lower() == 'nan':
                return row, "Dead URL"
                
            response = requests.get(fallback_url, headers=headers, timeout=10)
            
            if response.status_code != 200:
                return row, "Dead URL"
                
            text = response.text
            if UK_REGEX.search(text):
                return row, "UK"
            else:
                return row, "No UK Jobs"
                
    except Exception:
        return row, "Dead URL"

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    input_file = os.path.join(script_dir, "data", "excel", "Testing_jobs_data.xlsx")
    uk_output_file = os.path.join(script_dir, "data", "excel", "UK_companies_only.xlsx")
    non_uk_output_file = os.path.join(script_dir, "data", "excel", "Non_UK_companies.xlsx")
    checkpoint_file = os.path.join(script_dir, "data", "excel", "uk_progress_checkpoint.xlsx")
    
    print(f"Reading {input_file}...")
    try:
        df = pd.read_excel(input_file)
    except Exception as e:
        print(f"Error reading input file: {e}")
        return
        
    uk_rows = []
    non_uk_rows = []
    
    rows = df.to_dict('records')
    total_rows = len(rows)
    print(f"Checking {total_rows} URLs. This process will take significant time...")
    
    completed = 0
    start_time = time.time()
    
    # Use max 10 workers as requested
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(check_url, r): r for r in rows}
        
        for future in concurrent.futures.as_completed(futures):
            row, result = future.result()
            
            if result == "UK":
                uk_rows.append(row)
            else:
                row_copy = row.copy()
                row_copy['Removal_Reason'] = result
                non_uk_rows.append(row_copy)
                
            completed += 1
            
            # Print ETA every 500 rows
            if completed % 500 == 0:
                elapsed = time.time() - start_time
                avg_time = elapsed / completed
                remaining = total_rows - completed
                eta_seconds = remaining * avg_time
                eta_mins = int(eta_seconds // 60)
                eta_hours = int(eta_mins // 60)
                
                if eta_hours > 0:
                    eta_str = f"{eta_hours}h {eta_mins % 60}m"
                else:
                    eta_str = f"{eta_mins}m {int(eta_seconds % 60)}s"
                    
                print(f"Processed {completed}/{total_rows} | ETA: {eta_str}")
                
            # Save checkpoint every 1000 rows
            if completed % 1000 == 0:
                print(f"Saving checkpoint at {completed} rows to {checkpoint_file}...")
                df_chk = pd.DataFrame(uk_rows)
                if not df_chk.empty:
                    df_chk.to_excel(checkpoint_file, index=False)

    print("\n--- Processing Complete ---")
    
    df_uk = pd.DataFrame(uk_rows)
    df_non_uk = pd.DataFrame(non_uk_rows)
    
    # Re-sequence Company IDs for UK companies from 1 and ensure correct columns
    if not df_uk.empty:
        cols = ['Company ID', 'Company Name', 'ATS Provider', 'ATS Board Token', 'URL', 'Verification']
        df_uk = df_uk[[c for c in cols if c in df_uk.columns]]
        df_uk['Company ID'] = range(1, len(df_uk) + 1)
        
    if not df_non_uk.empty:
        cols = ['Company ID', 'Company Name', 'ATS Provider', 'ATS Board Token', 'URL', 'Verification', 'Removal_Reason']
        df_non_uk = df_non_uk[[c for c in cols if c in df_non_uk.columns]]
        
    # Save the output files
    print(f"Saving {len(df_uk)} UK companies to {uk_output_file}")
    if not df_uk.empty:
        df_uk.to_excel(uk_output_file, index=False)
        
    print(f"Saving {len(df_non_uk)} Non-UK/Dead companies to {non_uk_output_file}")
    if not df_non_uk.empty:
        df_non_uk.to_excel(non_uk_output_file, index=False)

if __name__ == "__main__":
    main()
