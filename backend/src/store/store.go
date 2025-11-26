package store

import (
	"fmt"
	"log"

	"github.com/energye/energy/v2/cef/ipc"
	"github.com/tidwall/buntdb"
)

var db *buntdb.DB

func InitStore() error {
	db, err := buntdb.Open("./zot.db")
	if err != nil {
		fmt.Println("open zot.db error:", err)
		return err
	}

	ipc.On("store-get", func(key string) string {
		v := ""
		err = db.View(func(tx *buntdb.Tx) error {
			val, err := tx.Get(key)
			if err != nil {
				return err
			}
			v = val
			return nil
		})
		if err != nil {
			fmt.Println("store get error:", err)
		}
		return v
	})

	ipc.On("store-set", func(key string, value string) bool {
		err := db.Update(func(tx *buntdb.Tx) error {
			_, _, err := tx.Set(key, value, nil)
			return err
		})
		if err != nil {
			fmt.Println("store set error:", err)
			return false
		}
		return true
	})

	ipc.On("store-delete", func(key string) bool {
		err := db.Update(func(tx *buntdb.Tx) error {
			_, err := tx.Delete(key)
			return err
		})
		if err != nil {
			log.Println("store delete error:", err)
			return false
		}
		return true
	})

	ipc.On("store-has", func(key string) bool {
		err := db.View(func(tx *buntdb.Tx) error {
			_, err := tx.Get(key)
			return err
		})
		// 如果 err 为 nil，说明键存在；否则键不存在
		return err == nil
	})

	fmt.Println("Store Initialized")
	return nil
}

func CloseStore() {
	if db != nil {
		db.Close()
		fmt.Println("Store Closed")
	}
}
