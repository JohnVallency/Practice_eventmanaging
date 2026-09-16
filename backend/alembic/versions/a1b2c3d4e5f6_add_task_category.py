"""add task category

Revision ID: a1b2c3d4e5f6
Revises: a7b8c9d0e1f2
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("category", sa.String(length=60), nullable=True))
    op.create_index("ix_tasks_category", "tasks", ["category"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tasks_category", table_name="tasks")
    op.drop_column("tasks", "category")