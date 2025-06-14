Model Providers
Anthropic

anthropic:
api_key: "your_anthropic_key" # Can also use ANTHROPIC_API_KEY env var
base_url: "https://api.anthropic.com/v1" # Optional, only include to override
OpenAI

openai:
api_key: "your_openai_key" # Can also use OPENAI_API_KEY env var
base_url: "https://api.openai.com/v1" # Optional, only include to override
reasoning_effort: "medium" # Default reasoning effort: "low", "medium", or "high"
Azure OpenAI

# Option 1: Using resource_name and api_key (standard method)

azure:
api_key: "your_azure_openai_key" # Required unless using DefaultAzureCredential
resource_name: "your-resource-name" # Resource name in Azure
azure_deployment: "deployment-name" # Required - deployment name from Azure
api_version: "2023-05-15" # Optional API version

# Do NOT include base_url if you use resource_name

# Option 2: Using base_url and api_key (custom endpoints or sovereign clouds)

# azure:

# api_key: "your_azure_openai_key"

# base_url: "https://your-endpoint.openai.azure.com/"

# azure_deployment: "deployment-name"

# api_version: "2023-05-15"

# # Do NOT include resource_name if you use base_url

# Option 3: Using DefaultAzureCredential (for managed identity, Azure CLI, etc.)

# azure:

# use_default_azure_credential: true

# base_url: "https://your-endpoint.openai.azure.com/"

# azure_deployment: "deployment-name"

# api_version: "2023-05-15"

# # Do NOT include api_key or resource_name in this mode

Important configuration notes: - Use either resource_name or base_url, not both. - When using DefaultAzureCredential, do NOT include api_key or resource_name (the azure-identity package must be installed). - When using base_url, do NOT include resource_name. - When using resource_name, do NOT include base_url. - The model string format is azure.deployment-name

DeepSeek

deepseek:
api_key: "your_deepseek_key" # Can also use DEEPSEEK_API_KEY env var
base_url: "https://api.deepseek.com/v1" # Optional, only include to override
Google

google:
api_key: "your_google_key" # Can also use GOOGLE_API_KEY env var
base_url: "https://generativelanguage.googleapis.com/v1beta/openai" # Optional
Generic (Ollama, etc.)

generic:
api_key: "ollama" # Default for Ollama, change as needed
base_url: "http://localhost:11434/v1" # Default for Ollama
OpenRouter

openrouter:
api_key: "your_openrouter_key" # Can also use OPENROUTER_API_KEY env var
base_url: "https://openrouter.ai/api/v1" # Optional, only include to override
TensorZero

tensorzero:
base_url: "http://localhost:3000" # Optional, only include to override
See the TensorZero Quick Start and the TensorZero Gateway Deployment Guide for more information on how to deploy the TensorZero Gateway.

MCP Server Configuration
MCP Servers are defined under the mcp.servers section:

mcp:
servers: # Example stdio server
server_name:
transport: "stdio" # "stdio" or "sse"
command: "npx" # Command to execute
args: ["@package/server-name"] # Command arguments as array
read_timeout_seconds: 60 # Optional timeout in seconds
env: # Optional environment variables
ENV_VAR1: "value1"
ENV_VAR2: "value2"
sampling: # Optional sampling settings
model: "haiku" # Model to use for sampling requests

    # Example Stremable HTTP server
    streambale_http__server:
      transport: "http"
      url: "http://localhost:8000/mcp"
      read_transport_sse_timeout_seconds: 300  # Timeout for HTTP connections
      headers:  # Optional HTTP headers
        Authorization: "Bearer token"
      auth:  # Optional authentication
        api_key: "your_api_key"

    # Example SSE server
    sse_server:
      transport: "sse"
      url: "http://localhost:8000/sse"
      read_transport_sse_timeout_seconds: 300  # Timeout for SSE connections
      headers:  # Optional HTTP headers
        Authorization: "Bearer token"
      auth:  # Optional authentication
        api_key: "your_api_key"


    # Server with roots
    file_server:
      transport: "stdio"
      command: "command"
      args: ["arguments"]
      roots:  # Root directories accessible to this server
        - uri: "file:///path/to/dir"  # Must start with file://
          name: "Optional Name"  # Optional display name for the root
          server_uri_alias: "file:///server/path"  # Optional, for consistent paths

OpenTelemetry Settings

otel:
enabled: false # Enable or disable OpenTelemetry
service_name: "fast-agent" # Service name for tracing
otlp_endpoint: "http://localhost:4318/v1/traces" # OTLP endpoint for tracing
console_debug: false # Log spans to console
sample_rate: 1.0 # Sample rate (0.0-1.0)
Logging Settings

logger:
type: "file" # "none", "console", "file", or "http"
level: "warning" # "debug", "info", "warning", or "error"
progress_display: true # Enable/disable progress display
path: "fastagent.jsonl" # Path to log file (for "file" type)
batch_size: 100 # Events to accumulate before processing
flush_interval: 2.0 # Flush interval in seconds
max_queue_size: 2048 # Maximum queue size for events

# HTTP logger settings

http_endpoint: "https://logging.example.com" # Endpoint for HTTP logger
http_headers: # Headers for HTTP logger
Authorization: "Bearer token"
http_timeout: 5.0 # Timeout for HTTP logger requests

# Console display options

show_chat: true # Show chat messages on console
show_tools: true # Show MCP Server tool calls on console
truncate_tools: true # Truncate long tool calls in display
enable_markup: true # Disable if outputs conflict with rich library markup
Example Full Configuration

default_model: "haiku"
execution_engine: "asyncio"

# Model provider settings

anthropic:
api_key: API_KEY

openai:
api_key: API_KEY
reasoning_effort: "high"

# MCP servers

mcp:
servers:
fetch:
transport: "stdio"
command: "uvx"
args: ["mcp-server-fetch"]

    prompts:
      transport: "stdio"
      command: "prompt-server"
      args: ["prompts/myprompt.txt"]

    filesys:
      transport: "stdio"
      command: "uvx"
      args: ["mcp-server-filesystem"]
      roots:
        - uri: "file://./data"
          name: "Data Directory"

# Logging configuration

logger:
type: "file"
level: "info"
path: "logs/fastagent.jsonl"
Environment Variables
All configuration options can be set via environment variables using a nested delimiter:

ANTHROPIC**API_KEY=your_key
OPENAI**API_KEY=your_key
LOGGER\_\_LEVEL=debug
