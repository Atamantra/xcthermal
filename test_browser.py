import urllib.request
import re

html = open("templates/index.html").read()

# Let's count unclosed divs manually from profile-container to the end
start = html.find('<div class="profile-container')

# To be exact, lets just print the tags
import html.parser
class TagCounter(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.output = []
        self.capture = False
        self.error = None
        
    def handle_starttag(self, tag, attrs):
        if not self.capture:
            attr_dict = dict(attrs)
            if tag == "div" and "profile-container" in attr_dict.get("class", ""):
                self.capture = True
        
        if self.capture:
            if tag in ["img", "input", "br", "hr", "meta", "link"]:
                pass
            else:
                self.stack.append((tag, self.getpos()[0]))
                self.output.append(" " * len(self.stack) + f"<{tag}>")
    
    def handle_endtag(self, tag):
        if not self.capture: return
        
        if tag in ["img", "input", "br", "hr", "meta", "link"]:
            return
            
        if not self.stack:
            return
            
        expected_tag, line = self.stack.pop()
        if expected_tag != tag:
            self.error = f"TAG MISMATCH at line {self.getpos()[0]}: expected </{expected_tag}> (from line {line}), got </{tag}>"
            print(self.error)
            
            # just pop until we match to recover
            while self.stack and self.stack[-1][0] != tag:
                self.stack.pop()
            if self.stack:
                self.stack.pop()
                self.output.append(" " * (len(self.stack)+1) + f"</{tag}> (recovered)")
        else:
            self.output.append(" " * (len(self.stack)+1) + f"</{tag}>")
            
        if len(self.stack) == 0:
            self.capture = False
            print(f"PROFILE CONTAINER CLOSED at line {self.getpos()[0]}")

parser = TagCounter()
parser.feed(html)
if not parser.error:
    print("NO DOM MISMATCH DETECTED!")
