import sys

file_path = "components/StartScreen.tsx"
with open(file_path, "r") as f:
    content = f.read()

# 1. Add ref
content = content.replace(
    "const newsDataRef = useRef<NewsArticle[] | null>(null);",
    "const newsDataRef = useRef<NewsArticle[] | null>(null);\n  const fetchAbortControllerRef = useRef<AbortController | null>(null);"
)

# 2. Update interruptSpeech
content = content.replace(
    "isPlayingAudioRef.current = false;\n    if (currentAudioRef.current) {",
    "isPlayingAudioRef.current = false;\n    if (fetchAbortControllerRef.current) {\n      fetchAbortControllerRef.current.abort();\n    }\n    if (currentAudioRef.current) {"
)

# 3. Update callOpenAIAndStream
content = content.replace(
    "isStreamingRef.current = true;\n\n      const response = await fetch('/api/openai-chat', {",
    "isStreamingRef.current = true;\n\n      fetchAbortControllerRef.current = new AbortController();\n\n      const response = await fetch('/api/openai-chat', {\n        signal: fetchAbortControllerRef.current.signal,"
)

# 4. Update catch block
content = content.replace(
    "} catch (e) {\n      console.error(\"OpenAI stream failed:\", e);\n      speakStreamedSentence(\"Sorry, I am having trouble connecting to my systems right now.\");",
    "} catch (e: any) {\n      if (e.name === 'AbortError') {\n        console.log(\"OpenAI stream aborted.\");\n        return;\n      }\n      console.error(\"OpenAI stream failed:\", e);\n      speakStreamedSentence(\"Sorry, I am having trouble connecting to my systems right now.\");"
)

# 5. Update processCommand
content = content.replace(
    "audioQueueRef.current = [];\n    if (currentAudioRef.current) {",
    "audioQueueRef.current = [];\n    if (fetchAbortControllerRef.current) {\n      fetchAbortControllerRef.current.abort();\n    }\n    if (currentAudioRef.current) {"
)

with open(file_path, "w") as f:
    f.write(content)

print("Patched StartScreen.tsx")
