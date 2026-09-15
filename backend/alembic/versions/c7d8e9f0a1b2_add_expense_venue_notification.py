"""add expense, venue and notification

Revision ID: c7d8e9f0a1b2
Revises: b20a1bdc79a7
Create Date: 2026-09-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7d8e9f0a1b2'
down_revision: Union[str, None] = 'b20a1bdc79a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Применить миграцию."""
    # sa.Enum внутри create_table сам создаёт ENUM-тип notificationtype.
    op.create_table('expenses',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('event_id', sa.UUID(), nullable=False),
    sa.Column('category', sa.String(length=100), nullable=False),
    sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], name=op.f('fk_expenses_event_id_events'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_expenses'))
    )
    op.create_index(op.f('ix_expenses_event_id'), 'expenses', ['event_id'], unique=False)
    op.create_table('venues',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('event_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('address', sa.String(length=500), nullable=True),
    sa.Column('latitude', sa.Numeric(precision=9, scale=6), nullable=False),
    sa.Column('longitude', sa.Numeric(precision=9, scale=6), nullable=False),
    sa.CheckConstraint('latitude >= -90 AND latitude <= 90', name=op.f('ck_venues_latitude_range')),
    sa.CheckConstraint('longitude >= -180 AND longitude <= 180', name=op.f('ck_venues_longitude_range')),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], name=op.f('fk_venues_event_id_events'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_venues'))
    )
    op.create_index(op.f('ix_venues_event_id'), 'venues', ['event_id'], unique=False)
    op.create_table('notifications',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('event_id', sa.UUID(), nullable=False),
    sa.Column('type', sa.Enum('task_overdue', 'info', name='notificationtype'), nullable=False),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('is_read', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], name=op.f('fk_notifications_event_id_events'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_notifications'))
    )
    op.create_index(op.f('ix_notifications_event_id'), 'notifications', ['event_id'], unique=False)


def downgrade() -> None:
    """Откатить миграцию."""
    op.drop_index(op.f('ix_notifications_event_id'), table_name='notifications')
    op.drop_table('notifications')
    op.drop_index(op.f('ix_venues_event_id'), table_name='venues')
    op.drop_table('venues')
    op.drop_index(op.f('ix_expenses_event_id'), table_name='expenses')
    op.drop_table('expenses')
    # ENUM-тип удаляется явно: DROP TABLE его не убирает.
    op.execute("DROP TYPE IF EXISTS notificationtype")
