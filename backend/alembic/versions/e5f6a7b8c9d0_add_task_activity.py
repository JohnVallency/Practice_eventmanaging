"""add task activity

Revision ID: e5f6a7b8c9d0
Revises: d9e4f5a6b7c8
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d9e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("tags", postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default="[]"))
    op.create_table(
        "task_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author", sa.String(length=120), server_default="Анна", nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_comments_task_id", "task_comments", ["task_id"])
    op.create_table(
        "task_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("from_value", sa.String(length=255), nullable=True),
        sa.Column("to_value", sa.String(length=255), nullable=True),
        sa.Column("author", sa.String(length=120), server_default="Анна", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_history_task_id", "task_history", ["task_id"])


def downgrade() -> None:
    op.drop_index("ix_task_history_task_id", table_name="task_history")
    op.drop_table("task_history")
    op.drop_index("ix_task_comments_task_id", table_name="task_comments")
    op.drop_table("task_comments")
    op.drop_column("tasks", "tags")