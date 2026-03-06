from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto('file:///Users/atamantra/Desktop/xcthermal-home/v1.1a/templates/index.html')
    
    html = page.evaluate('''() => {
        let el = document.querySelector('.profile-container');
        return el ? el.outerHTML : "NOT FOUND";
    }''')
    
    with open("dumped_profile.html", "w") as f:
        f.write(html)
        
    print("Dumped outerHTML to dumped_profile.html")
    browser.close()
