from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto('file:///Users/atamantra/Desktop/xcthermal-home/v1.1a/templates/index.html')
    
    # Evaluate where AI Reports is
    is_inside = page.evaluate('''() => {
        let ai = document.getElementById('t_aiReports');
        let profile = document.querySelector('.profile-container');
        return profile.contains(ai);
    }''')
    
    # Let's completely dump the children of profile-container
    children = page.evaluate('''() => {
        let profile = document.querySelector('.profile-container');
        return Array.from(profile.children).map(c => [c.tagName, c.className].join('.'));
    }''')
    
    print("AI Reports inside profile-container:", is_inside)
    print("Children of profile-container:")
    print("\n".join(children))
    
    browser.close()
