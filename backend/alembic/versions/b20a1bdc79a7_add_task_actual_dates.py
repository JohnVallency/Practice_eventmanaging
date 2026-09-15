"""add task actual dates

Revision ID: b20a1bdc79a7
Revises: 04fe52f10e32
Create Date: 2026-09-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b20a1bdc79a7'
down_revision: Union[str, None] = '04fe52f10e32'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Применить миграцию."""
    op.add_column('tasks', sa.Column('actual_start', sa.Integer(), nullable=True))
    op.add_column('tasks', sa.Column('actual_finish', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Откатить миграцию."""
    op.drop_column('tasks', 'actual_finish')
    op.drop_column('tasks', 'actual_start')
