"""add event planning details

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("events", sa.Column("description", sa.String(length=4000), nullable=False, server_default=""))
    op.add_column("events", sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Europe/Moscow"))
    op.add_column("events", sa.Column("venue_name", sa.String(length=255), nullable=True))
    op.add_column("events", sa.Column("venue_address", sa.String(length=500), nullable=True))
    op.add_column("events", sa.Column("venue_room", sa.String(length=160), nullable=True))
    op.add_column("events", sa.Column("online_url", sa.String(length=500), nullable=True))
    op.add_column("events", sa.Column("organizer_name", sa.String(length=160), nullable=True))
    op.add_column("events", sa.Column("organizer_contact", sa.String(length=255), nullable=True))
    op.add_column("events", sa.Column("max_participants", sa.Integer(), nullable=True))
    op.add_column("events", sa.Column("color", sa.String(length=16), nullable=False, server_default="#E1A24A"))


def downgrade() -> None:
    for column in ("color", "max_participants", "organizer_contact", "organizer_name", "online_url", "venue_room", "venue_address", "venue_name", "timezone", "description"):
        op.drop_column("events", column)