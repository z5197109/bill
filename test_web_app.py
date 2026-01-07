# test_web_app.py - Simple test script for the web application
import requests
import json
import os

def test_categories_endpoint():
    """Test the categories API endpoint"""
    try:
        response = requests.get('http://localhost:5000/api/categories')
        print(f"Categories API Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Categories: {data.get('categories', [])}")
            return True
        else:
            print(f"Error: {response.text}")
            return False
    except Exception as e:
        print(f"Failed to test categories endpoint: {e}")
        return False

def test_upload_endpoint():
    """Test the upload API endpoint with a sample image"""
    try:
        # Check if we have a test image
        test_image_path = os.path.join('data', 'bills', '0107_1.jpg')
        if not os.path.exists(test_image_path):
            print("No test image found, skipping upload test")
            return False
        
        # Prepare file for upload
        with open(test_image_path, 'rb') as f:
            files = {'files': f}
            response = requests.post('http://localhost:5000/api/upload', files=files)
        
        print(f"Upload API Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Upload successful: {data.get('success')}")
            print(f"Results count: {len(data.get('results', []))}")
            if data.get('results'):
                result = data['results'][0]
                print(f"Sample result - Merchant: {result.get('merchant')}, Amount: {result.get('amount')}")
            return True
        else:
            print(f"Error: {response.text}")
            return False
    except Exception as e:
        print(f"Failed to test upload endpoint: {e}")
        return False

def test_save_endpoint():
    """Test the save API endpoint with sample data"""
    try:
        # Sample bill data
        sample_data = {
            "bills": [
                {
                    "id": "test-123",
                    "merchant": "测试商户",
                    "amount": 99.99,
                    "category": "数码/电脑配件",
                    "filename": "test.jpg"
                }
            ]
        }
        
        response = requests.post(
            'http://localhost:5000/api/save',
            headers={'Content-Type': 'application/json'},
            data=json.dumps(sample_data)
        )
        
        print(f"Save API Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Save successful: {data.get('success')}")
            print(f"Saved count: {data.get('saved_count')}")
            return True
        else:
            print(f"Error: {response.text}")
            return False
    except Exception as e:
        print(f"Failed to test save endpoint: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Testing SnapLedger Web API...")
    print("=" * 40)
    
    print("\n1. Testing Categories Endpoint:")
    test_categories_endpoint()
    
    print("\n2. Testing Upload Endpoint:")
    test_upload_endpoint()
    
    print("\n3. Testing Save Endpoint:")
    test_save_endpoint()
    
    print("\n✅ Testing completed!")
    print("\n💡 To test the full web interface:")
    print("   1. Start the web app: python web_app.py")
    print("   2. Open browser: http://localhost:5000")
    print("   3. Upload some bill images and test the interface")