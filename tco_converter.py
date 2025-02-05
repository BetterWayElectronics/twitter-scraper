#Convert t.co links back to their original state using Curl.
#Made for use with my Twitter Scraper
#BwE
import subprocess
import glob
import os
import concurrent.futures

def get_location(url):
    try:
        # Run curl -i to fetch headers along with the body
        result = subprocess.run(["curl", "-i", url],
                                capture_output=True, text=True, timeout=10)
        # Split the output into lines
        lines = result.stdout.splitlines()
        location = None
        # In case there are multiple Location headers (e.g. multiple redirects),
        # we take the last one.
        for line in lines:
            if line.lower().startswith("location:"):
                location = line.split(":", 1)[1].strip()
        if location:
            return location
        else:
            return f"No Location header found for {url}"
    except Exception as e:
        return f"Error processing {url}: {e}"

def process_file(input_filename):
    output_filename = input_filename.replace("tco_links", "converted_links")
    
    try:
        with open(input_filename, "r") as infile:
            urls = [line.strip() for line in infile if line.strip()]
    except FileNotFoundError:
        print(f"Input file '{input_filename}' not found.")
        return

    results = []
    # Adjust max_workers based on your system; here we use 10 as an example.
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        # Submit all URL jobs concurrently
        future_to_url = {executor.submit(get_location, url): url for url in urls}
        for future in concurrent.futures.as_completed(future_to_url):
            url = future_to_url[future]
            try:
                location = future.result()
            except Exception as exc:
                location = f"Error processing {url}: {exc}"
            print(f"Processed URL: {url} -> {location}")
            results.append(location)
    
    with open(output_filename, "w") as outfile:
        for res in results:
            outfile.write(res + "\n")
    
    print(f"Results saved to {output_filename}")

def main():
    # Find all files in the current directory ending with "tco_links.txt"
    input_files = glob.glob("*tco_links.txt")
    
    if not input_files:
        print("No files ending with 'tco_links.txt' found.")
        return

    for input_filename in input_files:
        print(f"\nProcessing file: {input_filename}")
        process_file(input_filename)

if __name__ == "__main__":
    main()
