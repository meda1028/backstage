/*
 * Copyright 2024 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { TestDatabaseId, TestDatabases } from '@backstage/backend-test-utils';
import { DatabaseNotificationsStore } from './DatabaseNotificationsStore';
import { Knex } from 'knex';
import { v4 as uuid } from 'uuid';
import { Notification } from '@backstage/plugin-notifications-common';

jest.setTimeout(60_000);

const databases = TestDatabases.create();

async function createStore(databaseId: TestDatabaseId) {
  const knex = await databases.init(databaseId);
  const mgr = {
    getClient: async () => knex,
    migrations: {
      skip: false,
    },
  };
  return {
    knex,
    storage: await DatabaseNotificationsStore.create({ database: mgr }),
  };
}

const user = 'user:default/john.doe';
const testNotification: Partial<Notification> = {
  user,
  created: new Date(),
  origin: 'plugin-test',
  payload: {
    title: 'Notification 1',
    link: '/catalog',
    severity: 'normal',
  },
};

const otherUserNotification: Partial<Notification> = {
  ...testNotification,
  user: 'user:default/jane.doe',
};

describe.each(databases.eachSupportedId())(
  'DatabaseNotificationsStore (%s)',
  databaseId => {
    let storage: DatabaseNotificationsStore;
    let knex: Knex;
    const insertNotification = async (
      notification: Partial<Notification> & {
        id: string;
        saved?: Date;
        read?: Date;
      },
    ) =>
      (
        await knex('notification')
          .insert({
            id: notification.id,
            user: notification.user,
            origin: notification.origin,
            created: notification.created,
            link: notification.payload?.link,
            title: notification.payload?.title,
            severity: notification.payload?.severity,
            scope: notification.payload?.scope,
            saved: notification.saved,
            read: notification.read,
          })
          .returning('id')
      )[0].id ?? -1;

    beforeAll(async () => {
      ({ storage, knex } = await createStore(databaseId));
    });

    afterEach(async () => {
      jest.resetAllMocks();
      await knex('notification').del();
    });

    describe('getNotifications', () => {
      it('should return all notifications for user', async () => {
        const id1 = uuid();
        const id2 = uuid();
        await insertNotification({ id: id1, ...testNotification });
        await insertNotification({ id: id2, ...testNotification });
        await insertNotification({ id: uuid(), ...otherUserNotification });

        const notifications = await storage.getNotifications({ user });
        expect(notifications.length).toBe(2);
        expect(notifications.find(el => el.id === id1)).toBeTruthy();
        expect(notifications.find(el => el.id === id2)).toBeTruthy();
      });

      it('should return read notifications for user', async () => {
        const id1 = uuid();
        const id2 = uuid();
        const id3 = uuid();
        await insertNotification({ id: id1, ...testNotification });
        await insertNotification({ id: id2, ...testNotification });
        await insertNotification({ id: id3, ...testNotification });
        await insertNotification({ id: uuid(), ...otherUserNotification });

        await storage.markRead({ ids: [id1, id3], user });

        const notifications = await storage.getNotifications({
          user,
          read: true,
        });
        expect(notifications.length).toBe(2);
        expect(notifications.find(el => el.id === id1)).toBeTruthy();
        expect(notifications.find(el => el.id === id3)).toBeTruthy();
      });

      it('should return unread notifications for user', async () => {
        const id1 = uuid();
        const id2 = uuid();
        const id3 = uuid();
        await insertNotification({ id: id1, ...testNotification });
        await insertNotification({ id: id2, ...testNotification });
        await insertNotification({ id: id3, ...testNotification });
        await insertNotification({ id: uuid(), ...otherUserNotification });

        await storage.markRead({ ids: [id1, id3], user });

        const notifications = await storage.getNotifications({
          user,
          read: false,
        });
        expect(notifications.length).toBe(1);
        expect(notifications.at(0)?.id).toEqual(id2);
      });

      it('should return both read and unread notifications for user', async () => {
        const id1 = uuid();
        const id2 = uuid();
        const id3 = uuid();
        await insertNotification({ id: id1, ...testNotification });
        await insertNotification({ id: id2, ...testNotification });
        await insertNotification({ id: id3, ...testNotification });
        await insertNotification({ id: uuid(), ...otherUserNotification });

        await storage.markRead({ ids: [id1, id3], user });

        const notifications = await storage.getNotifications({
          user,
          read: undefined,
        });
        expect(notifications.length).toBe(3);
        expect(notifications.find(el => el.id === id1)).toBeTruthy();
        expect(notifications.find(el => el.id === id2)).toBeTruthy();
        expect(notifications.find(el => el.id === id3)).toBeTruthy();
      });

      it('should allow searching for notifications', async () => {
        const id1 = uuid();
        const id2 = uuid();
        await insertNotification({
          id: id1,
          ...testNotification,
          payload: {
            link: '/catalog',
            severity: 'normal',
            title: 'Please find me',
          },
        });
        await insertNotification({ id: id2, ...testNotification });
        await insertNotification({ id: uuid(), ...otherUserNotification });

        const notifications = await storage.getNotifications({
          user,
          search: 'find me',
        });
        expect(notifications.length).toBe(1);
        expect(notifications.at(0)?.id).toEqual(id1);
      });

      it('should filter notifications based on created date', async () => {
        const id1 = uuid();
        const id2 = uuid();
        await insertNotification({
          id: id1,
          ...testNotification,
          created: new Date(Date.now() - 1 * 60 * 60 * 1000 /* an hour ago */),
        });
        await insertNotification({
          id: id2,
          ...testNotification,
          payload: {
            severity: 'normal',
            title: 'Please find me',
          },
          created: new Date() /* now */,
        });
        await insertNotification({ id: uuid(), ...otherUserNotification });

        const notifications = await storage.getNotifications({
          user,
          createdAfter: new Date(Date.now() - 5 * 60 * 1000 /* 5mins */),
        });
        expect(notifications.length).toBe(1);
        expect(notifications.at(0)?.id).toEqual(id2);
      });
    });

    describe('getStatus', () => {
      it('should return status for user', async () => {
        const id1 = uuid();
        const id2 = uuid();
        await insertNotification({
          id: id1,
          ...testNotification,
          read: new Date(),
        });
        await insertNotification({ id: id2, ...testNotification });
        await insertNotification({ id: uuid(), ...otherUserNotification });

        const status = await storage.getStatus({ user });
        expect(status.read).toEqual(1);
        expect(status.unread).toEqual(1);
      });
    });

    describe('getExistingScopeNotification', () => {
      it('should return existing scope notification', async () => {
        const id1 = uuid();
        const notification: any = {
          ...testNotification,
          id: id1,
          payload: {
            title: 'Notification',
            link: '/scaffolder/task/1234',
            severity: 'normal',
            scope: 'scaffolder-1234',
          },
        };
        await insertNotification(notification);

        const existing = await storage.getExistingScopeNotification({
          user,
          origin: 'plugin-test',
          scope: 'scaffolder-1234',
        });
        expect(existing).not.toBeNull();
        expect(existing?.id).toEqual(id1);
      });
    });

    describe('restoreExistingNotification', () => {
      it('should return restore existing scope notification', async () => {
        const id1 = uuid();
        const notification: any = {
          ...testNotification,
          id: id1,
          read: new Date(),
          payload: {
            title: 'Notification',
            link: '/scaffolder/task/1234',
            severity: 'normal',
            scope: 'scaffolder-1234',
          },
        };
        await insertNotification(notification);

        const existing = await storage.restoreExistingNotification({
          id: id1,
          notification: {
            user: notification.user,
            payload: {
              title: 'New notification',
              link: '/scaffolder/task/1234',
              severity: 'normal',
            },
          } as any,
        });
        expect(existing).not.toBeNull();
        expect(existing?.id).toEqual(id1);
        expect(existing?.payload.title).toEqual('New notification');
        expect(existing?.read).toBeNull();
      });
    });

    describe('getNotification', () => {
      it('should return notification by id', async () => {
        const id1 = uuid();
        await insertNotification({ id: id1, ...testNotification });

        const notification = await storage.getNotification({ id: id1 });
        expect(notification?.id).toEqual(id1);
      });
    });

    describe('markRead', () => {
      it('should mark notification read', async () => {
        const id1 = uuid();
        await insertNotification({ id: id1, ...testNotification });

        await storage.markRead({ ids: [id1], user });
        const notification = await storage.getNotification({ id: id1 });
        expect(notification?.read).not.toBeNull();
      });
    });

    describe('markUnread', () => {
      it('should mark notification unread', async () => {
        const id1 = uuid();
        await insertNotification({
          id: id1,
          ...testNotification,
          read: new Date(),
        });

        await storage.markUnread({ ids: [id1], user });
        const notification = await storage.getNotification({ id: id1 });
        expect(notification?.read).toBeNull();
      });
    });

    describe('markSaved', () => {
      it('should mark notification saved', async () => {
        const id1 = uuid();
        await insertNotification({ id: id1, ...testNotification });

        await storage.markSaved({ ids: [id1], user });
        const notification = await storage.getNotification({ id: id1 });
        expect(notification?.saved).not.toBeNull();
      });
    });

    describe('markUnsaved', () => {
      it('should mark notification not saved', async () => {
        const id1 = uuid();
        await insertNotification({
          id: id1,
          ...testNotification,
          saved: new Date(),
        });

        await storage.markUnsaved({ ids: [id1], user });
        const notification = await storage.getNotification({ id: id1 });
        expect(notification?.saved).toBeNull();
      });
    });

    describe('saveNotification', () => {
      it('should store a notification', async () => {
        const id1 = uuid();
        await storage.saveNotification({
          id: id1,
          user,
          created: new Date(),
          origin: 'my-origin',
          payload: {
            title: 'My title One',
            description: 'a description of the notification',
            link: 'http://foo.bar',
            severity: 'normal',
            topic: 'my-topic',
          },
        });
        const notification = await storage.getNotification({ id: id1 });
        expect(notification?.payload?.title).toBe('My title One');
      });
    });
  },
);
