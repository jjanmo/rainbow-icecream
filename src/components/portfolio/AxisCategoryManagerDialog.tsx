import { useState } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { AXIS_CATEGORY_DESCRIPTION_MAX_LENGTH, type AxisCategory, type AxisCategoryType } from '@/types/domain';

const AXIS_COPY: Record<AxisCategoryType, { tabLabel: string; blurb: string; newName: string }> = {
  role: {
    tabLabel: '역할',
    blurb: '역할은 "이 종목을 왜 샀는가"에 대한 1차 축입니다.',
    newName: '새 역할',
  },
  sector: {
    tabLabel: '섹터',
    blurb: '섹터는 "무엇에 베팅하려고 샀는가"에 대한 2차 축입니다.',
    newName: '새 섹터',
  },
};

/**
 * "축 관리" 모달 — 역할·섹터를 별도 모달로 나누지 않고 하나의 모달 안에서 내부
 * 세그먼트 버튼(ADR-0051 패턴)으로 전환한다(ADR-0063 갱신). 이름/설명 CRUD +
 * 드래그로 순서 변경까지 담당한다 — 목표%는 여전히 다루지 않는다(`/portfolio`
 * 역할 탭 편집 모드에서). 헤더(제목+축 전환)와 "+ 추가" 버튼은 고정, 목록만
 * 최대 높이 안에서 스크롤된다.
 */
export function AxisCategoryManagerDialog({
  open,
  onOpenChange,
  roles,
  sectors,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: AxisCategory[];
  sectors: AxisCategory[];
  onAdd: (axis: AxisCategoryType, name: string) => Promise<void>;
  onUpdate: (id: string, patch: { name?: string; description?: string | null }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (axis: AxisCategoryType, orderedIds: string[]) => Promise<void>;
}) {
  const [activeAxis, setActiveAxis] = useState<AxisCategoryType>('role');
  const [deleteTarget, setDeleteTarget] = useState<AxisCategory | null>(null);
  const [adding, setAdding] = useState(false);
  const copy = AXIS_COPY[activeAxis];
  const categories = (activeAxis === 'role' ? roles : sectors).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = categories.map((c) => c.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    void onReorder(activeAxis, arrayMove(ids, oldIndex, newIndex));
  }

  async function handleAdd() {
    setAdding(true);
    try {
      await onAdd(activeAxis, copy.newName);
    } finally {
      setAdding(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    await onDelete(target.id);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-175 max-h-[85vh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>축 관리</DialogTitle>
          </DialogHeader>

          <div className="flex shrink-0 gap-1.5">
            {(Object.keys(AXIS_COPY) as AxisCategoryType[]).map((axis) => (
              <button
                key={axis}
                type="button"
                onClick={() => setActiveAxis(axis)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
                  activeAxis === axis
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {AXIS_COPY[axis].tabLabel}
              </button>
            ))}
          </div>

          <p className="shrink-0 text-xs text-muted-foreground">{copy.blurb}</p>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-2.5 pr-1">
              {categories.length === 0 && (
                <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                  아직 없습니다. 아래에서 추가하세요.
                </p>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  {categories.map((category) => (
                    <SortableCategoryRow
                      key={category.id}
                      category={category}
                      onUpdate={(patch) => onUpdate(category.id, patch)}
                      onDelete={() => setDeleteTarget(category)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => void handleAdd()}
            disabled={adding}
          >
            <Plus className="size-4" />
            {activeAxis === 'role' ? '새 역할 추가' : '새 섹터 추가'}
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>&ldquo;{deleteTarget?.name}&rdquo; 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 {activeAxis === 'role' ? '역할' : '섹터'}을 갖고 있던 종목은 자동으로 미
              {activeAxis === 'role' ? '분류' : '지정'}
              됩니다. 종목 자체는 삭제되지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmDelete()}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SortableCategoryRow({
  category,
  onUpdate,
  onDelete,
}: {
  category: AxisCategory;
  onUpdate: (patch: { name?: string; description?: string | null }) => Promise<void>;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  const [nameDraft, setNameDraft] = useState(category.name);
  const [prevName, setPrevName] = useState(category.name);
  if (category.name !== prevName) {
    setPrevName(category.name);
    setNameDraft(category.name);
  }
  const [descDraft, setDescDraft] = useState(category.description ?? '');
  const [prevDesc, setPrevDesc] = useState(category.description ?? '');
  if ((category.description ?? '') !== prevDesc) {
    setPrevDesc(category.description ?? '');
    setDescDraft(category.description ?? '');
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 rounded-lg border border-border bg-card p-2.5"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-4.5 shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        aria-label="순서 변경"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">이름</Label>
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              const trimmed = nameDraft.trim();
              if (trimmed && trimmed !== category.name) void onUpdate({ name: trimmed });
              else setNameDraft(category.name);
            }}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">설명 (선택)</Label>
          <Input
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value.slice(0, AXIS_CATEGORY_DESCRIPTION_MAX_LENGTH))}
            onBlur={() => {
              const trimmed = descDraft.trim();
              const normalized = trimmed === '' ? null : trimmed;
              if (normalized !== (category.description ?? null)) void onUpdate({ description: normalized });
            }}
            placeholder="설명을 입력하세요"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onDelete}
        className="mt-4.5 shrink-0 text-muted-foreground"
        aria-label="삭제"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
