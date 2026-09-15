/**
 * Страница ресурсов события /events/:id/resources.
 * CRUD ресурсов и управление назначениями на задачи.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../services/api";
import type { Assignment, ResourceType, Resource, Task } from "../types";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  Skeleton,
  Spinner,
  useToast,
} from "../components/ui";

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  human: "Люди",
  equipment: "Оборудование",
  venue: "Площадка",
};

const RESOURCE_TYPES: readonly ResourceType[] = ["human", "equipment", "venue"];

const SELECT_STYLE = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #E7E5E0",
  background: "#FFFFFF",
  font: "inherit",
  color: "inherit",
} as const;

interface CreateResourceForm {
  name: string;
  type: ResourceType;
  availability: string;
  cost: string;
}

const EMPTY_CREATE_FORM: CreateResourceForm = {
  name: "",
  type: "human",
  availability: "1",
  cost: "0",
};

interface AssignForm {
  taskId: string;
  units: string;
}

const EMPTY_ASSIGN_FORM: AssignForm = { taskId: "", units: "1" };

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

/** "10.00" → "10", "2.50" → "2.5", мусор → "". */
function formatAmount(value: string): string {
  const num = Number(value);
  return Number.isNaN(num) ? value : String(num);
}

export default function ResourcesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { push } = useToast();
  const pushRef = useRef(push);
  useEffect(() => {
    pushRef.current = push;
  }, [push]);

  const [resources, setResources] = useState<Resource[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateResourceForm>(EMPTY_CREATE_FORM);
  const [createBusy, setCreateBusy] = useState(false);

  const [assignResourceId, setAssignResourceId] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState<AssignForm>(EMPTY_ASSIGN_FORM);
  const [assignBusy, setAssignBusy] = useState(false);

  const [deleteAssignment, setDeleteAssignment] = useState<Assignment | null>(null);
  const [deleteAssignmentBusy, setDeleteAssignmentBusy] = useState(false);

  const [deleteResource, setDeleteResource] = useState<Resource | null>(null);
  const [deleteResourceBusy, setDeleteResourceBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!id) {
      setLoadError("Не указан идентификатор события.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [resourcesData, tasksData, assignmentsData] = await Promise.all([
        api.resources.list(id),
        api.tasks.list(id),
        api.assignments.list({}),
      ]);
      const eventIdSet = new Set(tasksData.map((task) => task.event_id));
      setResources(resourcesData);
      setTasks(tasksData);
      setAssignments(assignmentsData.filter((a) => eventIdSet.has(a.task_id)));
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setLoadError(message);
      pushRef.current({ tone: "error", title: "Ошибка загрузки ресурсов", message });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const taskNameById = new Map(tasks.map((task) => [task.id, task.name] as const));

  const assignmentsOf = (resourceId: string): Assignment[] =>
    assignments.filter((assignment) => assignment.resource_id === resourceId);

  const submitCreate = async (): Promise<void> => {
    if (!id) return;
    const name = createForm.name.trim();
    const availability = Number(createForm.availability);
    const cost = Number(createForm.cost);
    if (name.length === 0) {
      pushRef.current({ tone: "error", title: "Укажите название ресурса" });
      return;
    }
    if (!Number.isFinite(availability) || availability <= 0) {
      pushRef.current({ tone: "error", title: "Доступность — число больше 0" });
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      pushRef.current({ tone: "error", title: "Стоимость — число не меньше 0" });
      return;
    }
    setCreateBusy(true);
    try {
      await api.resources.create(id, {
        name,
        type: createForm.type,
        availability_per_day: availability.toFixed(2),
        cost_per_day: cost.toFixed(2),
      });
      pushRef.current({ tone: "ok", title: "Ресурс добавлен", message: name });
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE_FORM);
      await load();
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Не удалось добавить ресурс",
        message: getErrorMessage(error),
      });
    } finally {
      setCreateBusy(false);
    }
  };

  const openAssign = (resource: Resource): void => {
    setAssignResourceId(resource.id);
    setAssignForm(EMPTY_ASSIGN_FORM);
  };

  const submitAssign = async (): Promise<void> => {
    if (!assignResourceId) return;
    if (assignForm.taskId.length === 0) {
      pushRef.current({ tone: "error", title: "Выберите задачу" });
      return;
    }
    const units = Number(assignForm.units);
    if (!Number.isFinite(units) || units <= 0) {
      pushRef.current({ tone: "error", title: "Единицы — число больше 0" });
      return;
    }
    setAssignBusy(true);
    try {
      await api.assignments.create({
        task_id: assignForm.taskId,
        resource_id: assignResourceId,
        units_allocated: units.toFixed(2),
      });
      pushRef.current({ tone: "ok", title: "Назначение добавлено" });
      setAssignResourceId(null);
      await load();
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Не удалось добавить назначение",
        message: getErrorMessage(error),
      });
    } finally {
      setAssignBusy(false);
    }
  };

  const confirmDeleteAssignment = async (): Promise<void> => {
    if (!deleteAssignment) return;
    setDeleteAssignmentBusy(true);
    try {
      await api.assignments.delete(deleteAssignment.id);
      pushRef.current({ tone: "ok", title: "Назначение удалено" });
      setDeleteAssignment(null);
      await load();
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Не удалось удалить назначение",
        message: getErrorMessage(error),
      });
    } finally {
      setDeleteAssignmentBusy(false);
    }
  };

  const confirmDeleteResource = async (): Promise<void> => {
    if (!deleteResource) return;
    setDeleteResourceBusy(true);
    try {
      await api.resources.delete(deleteResource.id);
      pushRef.current({ tone: "ok", title: "Ресурс удалён", message: deleteResource.name });
      setDeleteResource(null);
      await load();
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Не удалось удалить ресурс",
        message: getErrorMessage(error),
      });
    } finally {
      setDeleteResourceBusy(false);
    }
  };

  const resourceScheduleHref = id === undefined ? "/events" : `/events/${id}/resource-schedule`;

  return (
    <section className="page">
      <div className="page__header">
        <h2 className="page__title">Ресурсы</h2>
        <div className="toolbar">
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            Добавить ресурс
          </Button>
          <Button variant="ghost" onClick={() => navigate(resourceScheduleHref)}>
            Ресурсное расписание и загрузка →
          </Button>
        </div>
      </div>

      {loading && (
        <div className="grid-cards">
          <div className="card" style={{ display: "grid", gap: 12 }}>
            <Skeleton w="50%" h={20} />
            <Skeleton w="100%" h={16} />
            <Skeleton w="80%" h={16} />
          </div>
          <div className="card" style={{ display: "grid", gap: 12 }}>
            <Skeleton w="50%" h={20} />
            <Skeleton w="100%" h={16} />
            <Skeleton w="80%" h={16} />
          </div>
        </div>
      )}

      {!loading && loadError !== null && (
        <EmptyState
          title="Не удалось загрузить ресурсы"
          hint={loadError}
          action={
            <Button variant="primary" onClick={() => void load()}>
              Повторить
            </Button>
          }
        />
      )}

      {!loading && loadError === null && resources.length === 0 && (
        <EmptyState
          title="Ресурсов пока нет"
          hint="Добавьте людей, оборудование или площадки, чтобы назначать их на задачи."
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              Добавить ресурс
            </Button>
          }
        />
      )}

      {!loading && loadError === null && resources.length > 0 && (
        <div className="grid-cards">
          {resources.map((resource) => {
            const resourceAssignments = assignmentsOf(resource.id);
            return (
              <div key={resource.id} className="card" style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong>{resource.name}</strong>
                  <Badge tone="muted">{RESOURCE_TYPE_LABELS[resource.type]}</Badge>
                </div>
                <div className="muted">
                  {formatAmount(resource.availability_per_day)}/день ·{" "}
                  {formatAmount(resource.cost_per_day)} ₽/день
                </div>
                <div className="toolbar">
                  <Button variant="sm" onClick={() => openAssign(resource)}>
                    Назначения
                  </Button>
                  <Button variant="sm" onClick={() => setDeleteResource(resource)}>
                    Удалить
                  </Button>
                </div>
                {resourceAssignments.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {resourceAssignments.map((assignment) => (
                      <li key={assignment.id}>
                        {taskNameById.get(assignment.task_id) ?? assignment.task_id}{" "}
                        <span className="muted">
                          ({formatAmount(assignment.units_allocated)} ед.)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={createOpen}
        title="Добавить ресурс"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" onClick={() => void submitCreate()} disabled={createBusy}>
              {createBusy ? (
                <>
                  <Spinner /> Сохранение…
                </>
              ) : (
                "Сохранить"
              )}
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <Field
            label="Название"
            value={createForm.name}
            onChange={(event) =>
              setCreateForm((form) => ({ ...form, name: event.target.value }))
            }
            placeholder="Например, Сцена"
          />
          <Field label="Тип">
            <select
              value={createForm.type}
              onChange={(event) =>
                setCreateForm((form) => ({
                  ...form,
                  type: event.target.value as ResourceType,
                }))
              }
              style={SELECT_STYLE}
            >
              {RESOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {RESOURCE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Доступность в день"
            type="number"
            min={0.01}
            step={0.01}
            value={createForm.availability}
            onChange={(event) =>
              setCreateForm((form) => ({ ...form, availability: event.target.value }))
            }
            hint="Больше 0, например 10"
          />
          <Field
            label="Стоимость в день"
            type="number"
            min={0}
            step={0.01}
            value={createForm.cost}
            onChange={(event) => setCreateForm((form) => ({ ...form, cost: event.target.value }))}
            hint="Не меньше 0"
          />
        </div>
      </Modal>

      <Modal
        open={assignResourceId !== null}
        title={
          assignResourceId === null
            ? "Назначения"
            : `Назначения: ${
                resources.find((resource) => resource.id === assignResourceId)?.name ?? ""
              }`
        }
        onClose={() => setAssignResourceId(null)}
        footer={
          <Button variant="ghost" onClick={() => setAssignResourceId(null)}>
            Закрыть
          </Button>
        }
      >
        {(() => {
          if (assignResourceId === null) {
            return null;
          }
          const resourceAssignments = assignmentsOf(assignResourceId);
          return (
            <>
              {resourceAssignments.length === 0 ? (
                <p className="muted" style={{ marginTop: 0 }}>
                  У этого ресурса пока нет назначений.
                </p>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    margin: "0 0 16px",
                    padding: 0,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  {resourceAssignments.map((assignment) => (
                    <li
                      key={assignment.id}
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span style={{ flex: 1 }}>
                        {taskNameById.get(assignment.task_id) ?? assignment.task_id}{" "}
                        <span className="muted">
                          ({formatAmount(assignment.units_allocated)} ед.)
                        </span>
                      </span>
                      <Button
                        variant="sm"
                        aria-label="Удалить назначение"
                        onClick={() => setDeleteAssignment(assignment)}
                      >
                        ×
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  borderTop: "1px solid #E7E5E0",
                  paddingTop: 12,
                }}
              >
                <strong>Добавить назначение</strong>
                <Field label="Задача">
                  <select
                    value={assignForm.taskId}
                    onChange={(event) =>
                      setAssignForm((form) => ({ ...form, taskId: event.target.value }))
                    }
                    style={SELECT_STYLE}
                  >
                    <option value="">— выберите задачу —</option>
                    {tasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Единицы"
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={assignForm.units}
                  onChange={(event) =>
                    setAssignForm((form) => ({ ...form, units: event.target.value }))
                  }
                  hint="Сколько единиц ресурса выделяется, больше 0"
                />
                <Button variant="primary" onClick={() => void submitAssign()} disabled={assignBusy}>
                  {assignBusy ? (
                    <>
                      <Spinner /> Добавление…
                    </>
                  ) : (
                    "Добавить назначение"
                  )}
                </Button>
              </div>
            </>
          );
        })()}
      </Modal>

      <Modal
        open={deleteAssignment !== null}
        title="Удаление назначения"
        onClose={() => setDeleteAssignment(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteAssignment(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirmDeleteAssignment()}
              disabled={deleteAssignmentBusy}
            >
              {deleteAssignmentBusy ? (
                <>
                  <Spinner /> Удаление…
                </>
              ) : (
                "Удалить"
              )}
            </Button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>
          Удалить назначение ресурса «
          {deleteAssignment === null
            ? ""
            : (resources.find((resource) => resource.id === deleteAssignment.resource_id)?.name ??
              "")}{" "}
          » на задачу «
          {deleteAssignment === null ? "" : (taskNameById.get(deleteAssignment.task_id) ?? "")}»?
        </p>
      </Modal>

      <Modal
        open={deleteResource !== null}
        title="Удаление ресурса"
        onClose={() => setDeleteResource(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteResource(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirmDeleteResource()}
              disabled={deleteResourceBusy}
            >
              {deleteResourceBusy ? (
                <>
                  <Spinner /> Удаление…
                </>
              ) : (
                "Удалить"
              )}
            </Button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>
          Удалить ресурс «{deleteResource?.name ?? ""}»? Его назначения будут удалены.
        </p>
      </Modal>
    </section>
  );
}
