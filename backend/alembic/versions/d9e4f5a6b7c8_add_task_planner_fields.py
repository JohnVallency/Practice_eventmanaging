"""add task planner fields

Revision ID: d9e4f5a6b7c8
Revises: c7d8e9f0a1b2
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d9e4f5a6b7c8"
down_revision: Union[str, None] = "c7d8e9f0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("status", sa.String(length=24), nullable=False, server_default="todo"))
    op.add_column("tasks", sa.Column("priority", sa.String(length=16), nullable=False, server_default="medium"))
    op.add_column("tasks", sa.Column("due_date", sa.Date(), nullable=True))
    op.add_column("tasks", sa.Column("assignee", sa.String(length=120), nullable=True))
    op.add_column("tasks", sa.Column("parent_id", sa.UUID(), nullable=True))
    op.create_index("ix_tasks_parent_id", "tasks", ["parent_id"], unique=False)
    op.create_foreign_key(
        "fk_tasks_parent_id_tasks", "tasks", "tasks", ["parent_id"], ["id"], ondelete="CASCADE"
    )


def downgrade() -> None:
    op.drop_constraint("fk_tasks_parent_id_tasks", "tasks", type_="foreignkey")
    op.drop_index("ix_tasks_parent_id", table_name="tasks")
    op.drop_column("tasks", "parent_id")
    op.drop_column("tasks", "assignee")
    op.drop_column("tasks", "due_date")
    op.drop_column("tasks", "priority")
    op.drop_column("tasks", "status")