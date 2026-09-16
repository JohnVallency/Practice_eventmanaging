"""add task description and archive flags

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("description", sa.String(length=2000), nullable=False, server_default=""))
    op.add_column("tasks", sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    op.drop_column("tasks", "archived")
    op.drop_column("tasks", "description")