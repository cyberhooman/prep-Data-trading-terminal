from anthropic import Anthropic

client = Anthropic(api_key="YOUR_API_KEY")  # Replace with your actual API key
resp = client.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello Claude"}]
)
print(resp.content[0].text)