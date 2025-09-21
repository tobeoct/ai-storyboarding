"""
LangChain-based prompt management system for Akaza
"""

import os
import yaml
from typing import Dict, Any, Optional, List
from pathlib import Path
from langchain.prompts import PromptTemplate
from langchain_core.prompts import ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate
from jinja2 import Environment, BaseLoader, meta
import logging

logger = logging.getLogger(__name__)

class PromptManager:
    """Manages prompt templates using LangChain and Jinja2"""

    def __init__(self, prompts_dir: str = "prompts"):
        self.prompts_dir = Path(prompts_dir)
        self.templates: Dict[str, Dict[str, Any]] = {}
        self.jinja_env = Environment(loader=BaseLoader())
        self.load_all_templates()

    def load_all_templates(self):
        """Load all YAML prompt templates from the prompts directory"""
        if not self.prompts_dir.exists():
            logger.warning(f"Prompts directory {self.prompts_dir} does not exist")
            return

        for yaml_file in self.prompts_dir.glob("*.yaml"):
            try:
                with open(yaml_file, 'r', encoding='utf-8') as f:
                    template_data = yaml.safe_load(f)

                template_name = template_data.get('name', yaml_file.stem)
                self.templates[template_name] = template_data
                logger.info(f"Loaded template: {template_name}")

            except Exception as e:
                logger.error(f"Error loading template {yaml_file}: {e}")

    def get_template(self, template_name: str) -> Optional[Dict[str, Any]]:
        """Get a template by name"""
        return self.templates.get(template_name)

    def list_templates(self) -> List[str]:
        """List all available template names"""
        return list(self.templates.keys())

    def render_template(self, template_name: str, variables: Dict[str, Any]) -> str:
        """Render a template with provided variables"""
        template_data = self.get_template(template_name)
        if not template_data:
            raise ValueError(f"Template '{template_name}' not found")

        template_str = template_data.get('template', '')
        if not template_str:
            raise ValueError(f"Template '{template_name}' has no template content")

        # Validate required variables
        self._validate_variables(template_name, variables)

        # Render with Jinja2
        template = self.jinja_env.from_string(template_str)
        return template.render(**variables)

    def get_system_prompt(self, template_name: str, variables: Dict[str, Any]) -> str:
        """Get the system prompt for a template"""
        template_data = self.get_template(template_name)
        if not template_data:
            raise ValueError(f"Template '{template_name}' not found")

        system_prompt = template_data.get('system_prompt', '')
        if not system_prompt:
            return ""

        # Render system prompt with variables
        template = self.jinja_env.from_string(system_prompt)
        return template.render(**variables)

    def create_chat_prompt(self, template_name: str, variables: Dict[str, Any]) -> ChatPromptTemplate:
        """Create a LangChain ChatPromptTemplate"""
        template_data = self.get_template(template_name)
        if not template_data:
            raise ValueError(f"Template '{template_name}' not found")

        messages = []

        # Add system prompt if available
        system_prompt = self.get_system_prompt(template_name, variables)
        if system_prompt:
            messages.append(SystemMessagePromptTemplate.from_template(system_prompt))

        # Add human message template
        human_template = self.render_template(template_name, variables)
        messages.append(HumanMessagePromptTemplate.from_template(human_template))

        return ChatPromptTemplate.from_messages(messages)

    def get_response_schema(self, template_name: str) -> Optional[Dict[str, Any]]:
        """Get the response schema for a template"""
        template_data = self.get_template(template_name)
        if not template_data:
            return None

        return template_data.get('response_schema')

    def _validate_variables(self, template_name: str, variables: Dict[str, Any]):
        """Validate that required variables are provided"""
        template_data = self.get_template(template_name)
        if not template_data:
            return

        template_variables = template_data.get('variables', [])

        for var_def in template_variables:
            var_name = var_def.get('name')
            is_required = var_def.get('required', False)
            default_value = var_def.get('default')

            if is_required and var_name not in variables:
                raise ValueError(f"Required variable '{var_name}' not provided for template '{template_name}'")

            # Set default values
            if var_name not in variables and default_value is not None:
                variables[var_name] = default_value

    def get_variable_definitions(self, template_name: str) -> List[Dict[str, Any]]:
        """Get variable definitions for a template"""
        template_data = self.get_template(template_name)
        if not template_data:
            return []

        return template_data.get('variables', [])


class ImageGenerationPrompt:
    """Specialized prompt handler for image generation"""

    def __init__(self, prompt_manager: PromptManager):
        self.prompt_manager = prompt_manager

    def create_prompt(self,
                     prompt: str,
                     style: str = "Cinematic Realism",
                     use_previous_context: bool = False) -> str:
        """Create an image generation prompt"""

        variables = {
            'prompt': prompt,
            'style': style,
            'use_previous_context': use_previous_context
        }

        return self.prompt_manager.render_template('image_generation_simple', variables)


class StoryboardTemplatePrompt:
    """Specialized prompt handler for storyboard templates"""

    def __init__(self, prompt_manager: PromptManager):
        self.prompt_manager = prompt_manager

    def create_prompt(self,
                     template_type: str,
                     context: str,
                     panel_count: int = 8) -> tuple[str, str, Dict[str, Any]]:
        """Create a storyboard template prompt"""

        template_name = f"{template_type}_template"

        variables = {
            'context': context,
            'panel_count': panel_count
        }

        # Get system prompt and user prompt
        system_prompt = self.prompt_manager.get_system_prompt(template_name, variables)
        user_prompt = self.prompt_manager.render_template(template_name, variables)
        response_schema = self.prompt_manager.get_response_schema(template_name)

        return system_prompt, user_prompt, response_schema


# Global prompt manager instance
prompt_manager = PromptManager()

# Specialized prompt handlers
image_prompt = ImageGenerationPrompt(prompt_manager)
storyboard_prompt = StoryboardTemplatePrompt(prompt_manager)