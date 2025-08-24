class TaskManager {
    constructor(maxParallelTasks = 2) {
        this.maxParallelTasks = maxParallelTasks;
        this.tasks = new Map();
        this.runningCount = 0;
        this.taskIdCounter = 1;
    }

    // Добавление задачи
    addTask(task, priority = 1, dependencies = [], timeout = null) {
        const id = `task${this.taskIdCounter++}`;
        this.tasks.set(id, {
            id,
            task,
            priority,
            dependencies,
            timeout,
            status: "pending",
            controller: new AbortController(),
        });
        return id;
    }

    // Изменение приоритета
    changePriority(taskId, newPriority) {
        if (this.tasks.has(taskId)) {
            this.tasks.get(taskId).priority = newPriority;
        }
    }

    // Отмена задачи и зависимых
    cancelTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task || task.status !== "pending") return;

        task.status = "canceled";
        task.controller.abort();

        // Отмена зависимых
        for (let [id, t] of this.tasks) {
            if (t.dependencies.includes(taskId)) {
                this.cancelTask(id);
            }
        }
    }

    // Получение статусов всех задач
    getStatus() {
        const status = {};
        for (let [id, task] of this.tasks) {
            status[id] = task.status;
        }
        return status;
    }

    // Запуск задач
    async executeTasks() {
        return new Promise((resolve) => {
            const tryRun = async () => {
                if ([...this.tasks.values()].every(t =>
                    ["completed", "failed", "canceled", "timeout"].includes(t.status)
                )) {
                    return resolve();
                }

                if (this.runningCount < this.maxParallelTasks) {
                    const readyTasks = [...this.tasks.values()]
                        .filter(t =>
                            t.status === "pending" &&
                            t.dependencies.every(dep => {
                                const depTask = this.tasks.get(dep);
                                return depTask && depTask.status === "completed";
                            })
                        )
                        .sort((a, b) => b.priority - a.priority);

                    for (const task of readyTasks.slice(0, this.maxParallelTasks - this.runningCount)) {
                        this.runTask(task, tryRun);
                    }
                }

                setTimeout(tryRun, 200);
            };

            tryRun();
        });
    }

    // Запуск конкретной задачи
    async runTask(task, callback) {
        this.runningCount++;
        task.status = "running";

        const timer = task.timeout
            ? setTimeout(() => {
                if (task.status === "running") {
                    task.status = "timeout";
                    task.controller.abort();
                    this.runningCount--;
                    callback();
                }
            }, task.timeout)
            : null;

        try {
            await task.task(task.controller.signal);
            if (task.status === "running") task.status = "completed";
        } catch (err) {
            if (task.status !== "timeout" && task.status !== "canceled") {
                task.status = "failed";
            }
        } finally {
            if (timer) clearTimeout(timer);
            this.runningCount--;
            callback();
        }
    }
}
