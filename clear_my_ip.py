#!/usr/bin/env python3
"""Clear your local IP from the free trial database"""

from app import app, db, UserActivity

def clear_local_ip():
    with app.app_context():
        # Local IPs that might be used
        local_ips = ['127.0.0.1', '::1', 'localhost']
        
        print("Searching for free trial entries with local IPs...")
        deleted_count = 0
        
        for ip in local_ips:
            entries = UserActivity.query.filter_by(
                ip_address=ip, 
                action='free_interpretation'
            ).all()
            
            if entries:
                print(f"Found {len(entries)} entry/entries for IP: {ip}")
                for entry in entries:
                    print(f"  - Deleting entry ID {entry.id} from {entry.timestamp}")
                    db.session.delete(entry)
                    deleted_count += 1
        
        if deleted_count > 0:
            db.session.commit()
            print(f"\n✅ Successfully deleted {deleted_count} free trial entry/entries")
            print("You can now test the free trial again from localhost!")
        else:
            print("\n⚠️  No free trial entries found for local IPs")
            print("Your IP hasn't used the free trial yet, or entries were already cleared.")

if __name__ == "__main__":
    clear_local_ip()
